import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { z } from "zod";
import type { D1PreparedStatement } from "@cloudflare/workers-types";

const AcceptSchema = z.object({
  accept: z.boolean().optional(),
  reason: z.string().optional(),
});

export const taskAcceptRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskAcceptRoute.post(
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

    const role = user.role;

    if (role === "PETUGAS") {
      const existingTask = await c.env.D1.prepare(
        `SELECT id, assigned_to, unit_id, status FROM tasks WHERE id = ? AND status = 'assigned'`,
      )
        .bind(taskId)
        .first<{
          id: string;
          assigned_to: string | null;
          unit_id: string | null;
          status: string;
        }>();

      if (!existingTask) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Task not found or already accepted",
            },
          },
          404,
        );
      }

      if (existingTask.assigned_to === user.sub) {
        await c.env.D1.prepare(
          `UPDATE tasks SET worker_id = assigned_to, status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND assigned_to = ? AND status = 'assigned'`,
        )
          .bind(taskId, user.sub)
          .run();

        const result = await c.env.D1.prepare(
          "SELECT id, status, accepted_at FROM tasks WHERE id = ?",
        )
          .bind(taskId)
          .first();

        return c.json({
          task_id: taskId,
          status: result!.status,
          accepted_at: result!.accepted_at,
        });
      }

      if (existingTask.assigned_to === null && existingTask.unit_id) {
        await c.env.D1.prepare(
          `UPDATE tasks SET assigned_to = ?, worker_id = ?, status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND assigned_to IS NULL AND worker_id IS NULL AND status = 'assigned'`,
        )
          .bind(user.sub, user.sub, taskId)
          .run();

        const result = await c.env.D1.prepare(
          "SELECT id, status, accepted_at FROM tasks WHERE id = ? AND assigned_to = ?",
        )
          .bind(taskId, user.sub)
          .first();

        if (!result) {
          return c.json(
            {
              error: {
                code: "NOT_FOUND",
                message: "Task not found or already accepted",
              },
            },
            404,
          );
        }

        return c.json({
          task_id: taskId,
          status: result.status,
          accepted_at: result.accepted_at,
        });
      }

      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Task not found or already accepted",
          },
        },
        404,
      );
    }

    const body = await parseJson(c, AcceptSchema);
    const accept = body.accept ?? true;
    const reason = body.reason ?? "";

    const taskR = await c.env.D1.prepare(
      "SELECT id, status, worker_id FROM tasks WHERE id = ?1 AND worker_id = ?2",
    )
      .bind(taskId, user.sub)
      .first<{ id: string; status: string; worker_id: string }>();
    if (!taskR) {
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
    }
    const currentStatus = taskR.status;
    if (currentStatus !== "assigned") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Task is already '${currentStatus}' and cannot be accepted/rejected`,
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    let newStatus: string;
    let acceptedAt: string | null = null;

    if (accept) {
      newStatus = "accepted";
      acceptedAt = new Date().toISOString();
      statements.push(
        c.env.D1.prepare(
          "UPDATE tasks SET status = ?1, accepted_at = ?2, updated_at = datetime('now') WHERE id = ?3",
        ).bind(newStatus, acceptedAt, taskId),
      );
    } else {
      newStatus = "rejected";
      statements.push(
        c.env.D1.prepare(
          "UPDATE tasks SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        ).bind(newStatus, taskId),
      );
    }

    statements.push(
      c.env.D1.prepare(
        `INSERT INTO task_clarifications (id, task_id, message, is_rejection, created_at)
     VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, datetime('now'))`,
      ).bind(
        taskId,
        reason || (accept ? "Task accepted" : "Task rejected"),
        !accept,
      ),
    );

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const afterR = await c.env.D1.prepare(
      "SELECT id, status, accepted_at, started_at FROM tasks WHERE id = ?1",
    )
      .bind(taskId)
      .first<{
        id: string;
        status: string;
        accepted_at: string | null;
        started_at: string | null;
      }>();

    const result = {
      before: { id: taskId, status: currentStatus },
      after: afterR,
      accept,
    };

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: accept ? "petugas_task_accept" : "petugas_task_reject",
        objectType: "task",
        objectId: taskId,
        after: result.after,
        reason,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: accept ? "petugas_task_accept" : "petugas_task_reject",
          err: e,
        }),
      ),
    );

    return c.json({
      task_id: taskId,
      status: result.after!.status,
      accepted: accept,
    });
  }),
);
