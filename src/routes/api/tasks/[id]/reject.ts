import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { SurveyorRejectSchema, PetugasRejectSchema } from "@/lib/schemas";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { ID_REGEX } from "@/lib/id";

export const taskRejectRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskRejectRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const taskId = c.req.param("id");
    if (!taskId)
      return c.json(
        {
          error: {
            code: "MISSING_TASK_ID",
            message: "Pilih tugas dari daftar terlebih dahulu.",
          },
        },
        400,
      );

    if (!ID_REGEX.test(taskId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Tautan tugas tidak valid. Buka kembali tugas dari daftar.",
          },
        },
        400,
      );
    }

    const role = user.role;

    if (role === "PETUGAS") {
      const { reason } = await parseJson(c, SurveyorRejectSchema);

      const taskR = await c.env.D1.prepare(
        "SELECT id, report_id, status FROM tasks WHERE id = ? AND assigned_to = ?",
      )
        .bind(taskId, user.sub)
        .first();
      if (!taskR)
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message:
                "Tugas tidak ditemukan atau tidak tersedia untuk akun Anda.",
            },
          },
          404,
        );

      const currentStatus = taskR.status as string;
      if (currentStatus !== "assigned" && currentStatus !== "in_progress") {
        return c.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: `Cannot reject task in '${currentStatus}' status`,
            },
          },
          409,
        );
      }

      const statements: D1PreparedStatement[] = [];
      statements.push(
        c.env.D1.prepare(
          "UPDATE tasks SET status = 'rejected', updated_at = datetime('now') WHERE id = ?",
        ).bind(taskId),
      );

      statements.push(
        c.env.D1.prepare(
          `INSERT INTO task_clarifications (id, task_id, message, is_rejection, created_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, true, datetime('now'))`,
        ).bind(taskId, reason),
      );

      if (statements.length > 0) await c.env.D1.batch(statements);

      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: user.sub,
          action: "task_reject",
          objectType: "task",
          objectId: taskId,
          after: { id: taskId, status: "rejected" },
          reason,
        }).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            audit_failure: true,
            action: "task_reject",
            err: e,
          }),
        ),
      );

      return c.json({ id: taskId, status: "rejected" });
    }

    const body = await parseJson(c, PetugasRejectSchema);
    const reason = body.reason;

    const taskR = await c.env.D1.prepare(
      "SELECT id, report_id, status FROM tasks WHERE id = ?1 AND worker_id = ?2",
    )
      .bind(taskId, user.sub)
      .first();
    if (!taskR)
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message:
              "Tugas tidak ditemukan atau tidak tersedia untuk akun Anda.",
          },
        },
        404,
      );

    const currentStatus = taskR.status as string;
    if (currentStatus !== "assigned" && currentStatus !== "in_progress") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Cannot reject task in '${currentStatus}' status`,
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        "UPDATE tasks SET status = 'rejected', updated_at = datetime('now') WHERE id = ?1",
      ).bind(taskId),
    );

    statements.push(
      c.env.D1.prepare(
        `INSERT INTO task_clarifications (id, task_id, message, is_rejection, created_at)
     VALUES (lower(hex(randomblob(16))), ?1, ?2, true, datetime('now'))`,
      ).bind(taskId, reason),
    );

    if (statements.length > 0) await c.env.D1.batch(statements);

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "petugas_task_reject",
        objectType: "task",
        objectId: taskId,
        after: { id: taskId, status: "rejected" },
        reason,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "petugas_task_reject",
          err: e,
        }),
      ),
    );

    return c.json({ id: taskId, status: "rejected" });
  }),
);
