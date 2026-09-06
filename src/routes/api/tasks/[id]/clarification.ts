import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { ClarificationSchema } from "@/lib/schemas";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { ID_REGEX } from "@/lib/id";

export const taskClarificationRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskClarificationRoute.post(
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

    const { message } = await parseJson(c, ClarificationSchema);
    const role = user.role;

    let taskR: Record<string, unknown> | null = null;
    if (role === "PETUGAS") {
      taskR =
        (await c.env.D1.prepare(
          "SELECT id, report_id, status FROM tasks WHERE id = ? AND assigned_to = ?",
        )
          .bind(taskId, user.sub)
          .first()) ?? null;
    } else {
      taskR =
        (await c.env.D1.prepare(
          "SELECT id, report_id, status FROM tasks WHERE id = ?1 AND worker_id = ?2",
        )
          .bind(taskId, user.sub)
          .first()) ?? null;
    }

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
    if (currentStatus === "completed") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message:
              "Tugas sudah selesai. Hubungi admin jika Anda perlu membahas hasilnya.",
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];

    if (currentStatus === "assigned") {
      statements.push(
        c.env.D1.prepare(
          "UPDATE tasks SET status = 'pending_clarification', updated_at = datetime('now') WHERE id = ?",
        ).bind(taskId),
      );
    }

    if (role === "PETUGAS") {
      const clarificationId = crypto.randomUUID();
      statements.push(
        c.env.D1.prepare(
          `INSERT INTO task_clarifications (id, task_id, message, is_rejection, created_at)
       VALUES (?, ?, ?, false, datetime('now'))`,
        ).bind(clarificationId, taskId, message),
      );

      if (statements.length > 0) await c.env.D1.batch(statements);

      const afterR = await c.env.D1.prepare(
        "SELECT id, status FROM tasks WHERE id = ?",
      )
        .bind(taskId)
        .first();

      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: user.sub,
          action: "task_clarification",
          objectType: "task",
          objectId: taskId,
          after: { clarification_id: clarificationId },
          reason: message,
        }).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            audit_failure: true,
            action: "task_clarification",
            err: e,
          }),
        ),
      );

      try {
        const reportIdR = await c.env.D1.prepare(
          "SELECT report_id FROM tasks WHERE id = ?",
        )
          .bind(taskId)
          .first();
        const reportId = reportIdR?.report_id as string | undefined;
        if (reportId) {
          await c.env.D1.prepare(
            `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at)
           SELECT lower(hex(randomblob(6))), assigned_to, 'status_change', 'Permintaan Klarifikasi', ?, ?, datetime('now')
           FROM reports WHERE id = ?`,
          )
            .bind(
              `Permintaan klarifikasi: ${message.substring(0, 100)}`,
              reportId,
              reportId,
            )
            .run();
        }
      } catch (e) {
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e as Error,
          context: "notification_insert_failed",
        });
      }

      return c.json({
        clarification_id: clarificationId,
        status: afterR!.status,
      });
    }

    statements.push(
      c.env.D1.prepare(
        `INSERT INTO task_clarifications (id, task_id, message, is_rejection, created_at)
     VALUES (lower(hex(randomblob(16))), ?1, ?2, false, datetime('now'))`,
      ).bind(taskId, message),
    );

    if (statements.length > 0) await c.env.D1.batch(statements);

    const lastIdR = await c.env.D1.prepare(
      "SELECT last_insert_rowid() as id",
    ).first<{ id: number }>();
    const clarificationId = lastIdR!.id;

    const afterR = await c.env.D1.prepare(
      "SELECT id, status FROM tasks WHERE id = ?1",
    )
      .bind(taskId)
      .first();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "petugas_task_clarification",
        objectType: "task",
        objectId: taskId,
        after: { clarification_id: clarificationId },
        reason: message,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "petugas_task_clarification",
          err: e,
        }),
      ),
    );

    try {
      const reportIdR = await c.env.D1.prepare(
        "SELECT report_id FROM tasks WHERE id = ?1",
      )
        .bind(taskId)
        .first();
      const reportId = reportIdR?.report_id as string | undefined;
      if (reportId) {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at)
         SELECT lower(hex(randomblob(6))), assigned_to, 'status_change', 'Permintaan Klarifikasi', ?1, ?2, datetime('now')
         FROM reports WHERE id = ?3`,
        )
          .bind(
            `Permintaan klarifikasi: ${message.substring(0, 100)}`,
            reportId,
            reportId,
          )
          .run();
      }
    } catch (e) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e as Error,
        context: "notification_insert_failed",
      });
    }

    return c.json({
      clarification_id: clarificationId,
      status: afterR!.status,
    });
  }),
);
