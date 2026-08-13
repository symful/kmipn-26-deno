import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const petugasEvidenceRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasEvidenceRoute.post("/:id", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  if (!UUID_REGEX.test(taskId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Task ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls : [];
  const notes = body.notes ? String(body.notes) : null;

  if (photoUrls.length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "photo_urls is required and must contain at least one URL" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const taskR = await client.query(
        "SELECT id, status FROM surveyor_tasks WHERE id = $1 AND petugas_id = $2",
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

      const evidenceR = await client.query<{ id: string }>(
        `INSERT INTO task_evidence (task_id, photo_urls, notes, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
        [taskId, JSON.stringify(photoUrls), notes]
      );

      const afterR = await client.query("SELECT id, status, progress_percent FROM surveyor_tasks WHERE id = $1", [taskId]);
      await client.query("COMMIT");

      return {
        evidence_id: evidenceR.rows[0]!.id,
        task: afterR.rows[0],
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  if (result.invalidStatus) {
    return c.json({ error: { code: "INVALID_STATUS", message: `Cannot add evidence to task in '${result.current}' status` } }, 409);
  }

  await appendAudit(c.env, {
    actor: user.sub,
    action: "petugas_task_evidence",
    objectType: "petugas_task",
    objectId: taskId,
    after: { evidence_id: result.evidence_id, photo_count: photoUrls.length },
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "petugas_task_evidence", err: e }));

  return c.json({ evidence_id: result.evidence_id, status: result.task.status });
}));
