import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const petugasRejectRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasRejectRoute.post("/", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  if (!UUID_REGEX.test(taskId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Task ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const reason = body.reason ? String(body.reason) : "";

  if (!reason || reason.length < 10) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "reason is required and must be at least 10 characters" } }, 400);
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
      if (currentStatus !== "assigned" && currentStatus !== "in_progress") {
        await client.query("COMMIT");
        return { invalidStatus: true, current: currentStatus };
      }

      await client.query(
        "UPDATE surveyor_tasks SET status = 'rejected', updated_at = NOW() WHERE id = $1",
        [taskId]
      );

      await client.query(
        `INSERT INTO task_clarifications (task_id, message, is_rejection, created_at)
         VALUES ($1, $2, true, NOW())`,
        [taskId, reason]
      );

      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         SELECT 'petugas_task_rejected', 'internal', $1, report_id
         FROM surveyor_tasks WHERE id = $2`,
        [JSON.stringify({ task_id: taskId, rejected_by: user.sub, reason }), taskId]
      );

      await client.query("COMMIT");

      return { id: taskId, status: "rejected" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  if (result.invalidStatus) {
    return c.json({ error: { code: "INVALID_STATUS", message: `Cannot reject task in '${result.current}' status` } }, 409);
  }

  await appendAudit(c.env, { activeRole: c.get("user").role,
    actor: user.sub,
    action: "petugas_task_reject",
    objectType: "petugas_task",
    objectId: taskId,
    after: { id: taskId, status: "rejected" },
    reason,
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "petugas_task_reject", err: e }));

  return c.json({ id: taskId, status: "rejected" });
}));
