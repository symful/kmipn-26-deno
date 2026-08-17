import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const petugasCompleteRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasCompleteRoute.post("/", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  if (!UUID_REGEX.test(taskId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Task ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const completionProof = body.completion_proof ? String(body.completion_proof) : null;
  const summary = body.summary ? String(body.summary) : null;

  if (!summary || summary.length < 10) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "summary is required and must be at least 10 characters" } }, 400);
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
      if (currentStatus !== "in_progress") {
        await client.query("COMMIT");
        return { invalidStatus: true, current: currentStatus };
      }

      const reportId = taskR.rows[0].report_id as string;

      await client.query(
        "UPDATE surveyor_tasks SET status = 'completed', completed_at = NOW(), progress_percent = 100, updated_at = NOW() WHERE id = $1",
        [taskId]
      );

      await client.query(
        "UPDATE reports SET status = 'under_review', updated_at = NOW() WHERE id = $1",
        [reportId]
      );

      await client.query(
        `INSERT INTO task_completions (task_id, completion_proof, summary, completed_by, completed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [taskId, completionProof, summary, user.sub]
      );

      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
         VALUES ($1, 'internal', $2, $3, NOW())`,
        ["petugas_task_completed", JSON.stringify({ task_id: taskId, report_id: reportId, completed_by: user.sub, summary }), reportId]
      );

      const afterR = await client.query("SELECT id, status, completed_at FROM surveyor_tasks WHERE id = $1", [taskId]);
      await client.query("COMMIT");

      return { before: { id: taskId, status: currentStatus }, after: afterR.rows[0], report_id: reportId };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  if (result.invalidStatus) {
    return c.json({ error: { code: "INVALID_STATUS", message: `Cannot complete task in '${result.current}' status` } }, 409);
  }

  await appendAudit(c.env, { activeRole: c.get("user").role,
    actor: user.sub,
    action: "petugas_task_complete",
    objectType: "petugas_task",
    objectId: taskId,
    after: result.after,
    reason: summary,
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "petugas_task_complete", err: e }));

  try {
    const assigneeRow = await withClient(c.env, async (client) => {
      const r = await client.query(`SELECT assigned_to FROM reports WHERE id = $1`, [result.report_id]);
      return r.rows[0];
    });
    if (assigneeRow?.assigned_to) {
      await sendNotification(c.env, assigneeRow.assigned_to, "task_completed", `Tugas telah selesai: ${summary}`, result.report_id, c.req.path, c.req.method);
    }
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
  }

  return c.json({ status: "completed", completed_at: result.after.completed_at });
}));
