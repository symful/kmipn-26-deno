import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

export const petugasAcceptRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasAcceptRoute.post("/:id", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  const body = await c.req.json();
  const accept = typeof body.accept === "boolean" ? body.accept : true;
  const reason = String(body.reason ?? "");

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const taskR = await client.query(
        "SELECT id, status, petugas_id FROM surveyor_tasks WHERE id = $1 AND petugas_id = $2",
        [taskId, user.sub]
      );
      if (!taskR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const currentStatus = taskR.rows[0].status as string;
      if (currentStatus !== "assigned") {
        await client.query("COMMIT");
        return { invalidStatus: true, current: currentStatus };
      }

      let newStatus: string;
      let acceptedAt: string | null = null;

      if (accept) {
        newStatus = "in_progress";
        acceptedAt = new Date().toISOString();
        await client.query(
          "UPDATE surveyor_tasks SET status = $1, accepted_at = $2, started_at = $2, updated_at = NOW() WHERE id = $3",
          [newStatus, acceptedAt, taskId]
        );
      } else {
        newStatus = "rejected";
        await client.query(
          "UPDATE surveyor_tasks SET status = $1, updated_at = NOW() WHERE id = $2",
          [newStatus, taskId]
        );
      }

      await client.query(
        `INSERT INTO task_clarifications (task_id, message, is_rejection, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [taskId, reason || (accept ? "Task accepted" : "Task rejected"), !accept]
      );

      const afterR = await client.query("SELECT id, status, accepted_at, started_at FROM surveyor_tasks WHERE id = $1", [taskId]);
      await client.query("COMMIT");

      return { before: { id: taskId, status: currentStatus }, after: afterR.rows[0], accept };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  if (result.invalidStatus) {
    return c.json({ error: { code: "INVALID_STATUS", message: `Task is already '${result.current}' and cannot be accepted/rejected` } }, 409);
  }

  await appendAudit(c.env, {
    actor: user.sub,
    action: accept ? "petugas_task_accept" : "petugas_task_reject",
    objectType: "petugas_task",
    objectId: taskId,
    after: result.after,
    reason,
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: accept ? "petugas_task_accept" : "petugas_task_reject", err: e }));

  if (!accept) {
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
           SELECT 'petugas_task_rejected', 'internal', $1, report_id
           FROM surveyor_tasks WHERE id = $2`,
          [JSON.stringify({ task_id: taskId, rejected_by: user.sub, reason }), taskId]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
    }
  }

  return c.json({ status: result.after.status, accepted: accept });
}));
