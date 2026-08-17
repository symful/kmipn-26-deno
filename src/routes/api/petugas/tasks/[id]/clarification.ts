import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const petugasClarificationRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasClarificationRoute.post("/", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  if (!UUID_REGEX.test(taskId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Task ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const message = body.message ? String(body.message) : null;

  if (!message || message.length < 5) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "message is required and must be at least 5 characters" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const taskR = await client.query(
        "SELECT id, report_id, status FROM surveyor_tasks WHERE id = $1 AND petugas_id = $2",
        [taskId, user.sub]
      );
      if (!taskR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      const currentStatus = taskR.rows[0].status as string;
      if (currentStatus === "completed") {
        await client.query("COMMIT");
        return { invalidStatus: true, current: currentStatus };
      }

      if (currentStatus === "assigned") {
        await client.query(
          "UPDATE surveyor_tasks SET status = 'pending_clarification', updated_at = NOW() WHERE id = $1",
          [taskId]
        );
      }

      const clarificationR = await client.query<{ id: string }>(
        `INSERT INTO task_clarifications (task_id, message, is_rejection, created_at)
         VALUES ($1, $2, false, NOW())
         RETURNING id`,
        [taskId, message]
      );

      const afterR = await client.query("SELECT id, status FROM surveyor_tasks WHERE id = $1", [taskId]);
      await client.query("COMMIT");

      return {
        clarification_id: clarificationR.rows[0]!.id,
        before: { id: taskId, status: currentStatus },
        after: afterR.rows[0],
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  if (result.invalidStatus) {
    return c.json({ error: { code: "INVALID_STATUS", message: `Cannot request clarification for completed task` } }, 409);
  }

  await appendAudit(c.env, { activeRole: c.get("user").role,
    actor: user.sub,
    action: "petugas_task_clarification",
    objectType: "petugas_task",
    objectId: taskId,
    after: { clarification_id: result.clarification_id },
    reason: message,
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "petugas_task_clarification", err: e }));

  try {
    await withClient(c.env, async (client) => {
      const reportIdR = await client.query("SELECT report_id FROM surveyor_tasks WHERE id = $1", [taskId]);
      const reportId = reportIdR.rows[0]?.report_id;
      if (reportId) {
        await client.query(
          `INSERT INTO notifications (user_id, kind, body, related_report_id)
           SELECT assigned_to, 'clarification_requested', $1, $2
           FROM reports WHERE id = $3`,
          [`Permintaan klarifikasi: ${message.substring(0, 100)}`, reportId, reportId]
        );
      }
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
  }

  return c.json({
    clarification_id: result.clarification_id,
    status: result.after.status,
  });
}));
