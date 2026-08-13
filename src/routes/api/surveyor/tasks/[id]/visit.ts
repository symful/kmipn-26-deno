import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

export const surveyorVisitRoute = new Hono<{ Bindings: Env }>();

surveyorVisitRoute.post("/", requireAuth, requireRole("SURVEYOR", "PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  const body = await c.req.json();
  const findings = String(body.findings);
  const checklist = Array.isArray(body.checklist) ? body.checklist : [];
  const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls : [];

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const taskR = await client.query(
        "UPDATE surveyor_tasks SET status = 'completed' WHERE id = $1 AND surveyor_id = $2 RETURNING report_id",
        [taskId, user.sub]
      );
      if (!taskR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const reportId = taskR.rows[0].report_id as string;

      await client.query(
        "INSERT INTO survey_visits (task_id, surveyor_id, findings, checklist, photo_urls) VALUES ($1, $2, $3, $4, $5)",
        [taskId, user.sub, findings, JSON.stringify(checklist), photoUrls]
      );

      await client.query(
        "UPDATE reports SET status = 'under_review', updated_at = NOW() WHERE id = $1",
        [reportId]
      );

      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
         VALUES ($1, 'internal', $2, $3, NOW())`,
        ["survey_completed", JSON.stringify({ report_id: reportId, action: "survey_completed", task_id: taskId }), reportId]
      );

      await client.query("COMMIT");
      return { task_id: taskId, report_id: reportId, status: "completed" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "TASK_NOT_FOUND", message: "Task not found or not assigned" } }, 404);

  await appendAudit(c.env, {
    actor: user.sub,
    action: "surveyor_visit",
    objectType: "surveyor_task",
    objectId: taskId,
    after: result,
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "surveyor_visit", err: e }));

  return c.json(result);
}));

surveyorVisitRoute.delete("/", requireAuth, requireRole("SURVEYOR", "PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const taskR = await client.query(
        "SELECT id, report_id FROM surveyor_tasks WHERE id = $1 AND surveyor_id = $2",
        [taskId, user.sub]
      );
      if (!taskR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const reportId = taskR.rows[0].report_id as string;

      await client.query("DELETE FROM survey_visits WHERE task_id = $1", [taskId]);

      await client.query("DELETE FROM surveyor_tasks WHERE id = $1 AND surveyor_id = $2", [taskId, user.sub]);

      await client.query("COMMIT");
      return { task_id: taskId, report_id: reportId, status: "deleted" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "TASK_NOT_FOUND", message: "Task not found or not assigned" } }, 404);

  await appendAudit(c.env, {
    actor: user.sub,
    action: "surveyor_task_delete",
    objectType: "surveyor_task",
    objectId: taskId,
    before: result,
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "surveyor_task_delete", err: e }));

  return c.json(result);
}));
