import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const taskStartRoute = new Hono<{ Bindings: Env }>();

taskStartRoute.post(
  "/",
  safeHandler(async (c) => {
    const taskId = c.req.param("id");
    const user = c.get("user");

    const beforeR = await c.env.D1.prepare(
      "SELECT id, status FROM tasks WHERE id = ? AND assigned_to = ?",
    )
      .bind(taskId, user.sub)
      .first<{ id: string; status: string }>();
    if (!beforeR) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Task not found or already started",
          },
        },
        404,
      );
    }
    if (beforeR.status !== "accepted") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Terima tugas sebelum memulai survei",
          },
        },
        409,
      );
    }

    await c.env.D1.prepare(
      `UPDATE tasks
     SET status = 'in_progress', worker_id = assigned_to, started_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND assigned_to = ? AND status = 'accepted' AND started_at IS NULL`,
    )
      .bind(taskId, user.sub)
      .run();

    const result = await c.env.D1.prepare(
      "SELECT id, status, started_at FROM tasks WHERE id = ?",
    )
      .bind(taskId)
      .first();

    if (!result) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Task not found or already started",
          },
        },
        404,
      );
    }

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        actor: user.sub,
        action: "task_started",
        objectType: "task",
        objectId: taskId,
        before: { status: beforeR.status },
        after: { status: result.status },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    return c.json({
      task_id: taskId,
      status: result.status,
      started_at: result.started_at,
    });
  }),
);
