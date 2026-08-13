import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const petugasProgressRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasProgressRoute.patch("/:id", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  if (!UUID_REGEX.test(taskId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Task ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const progressPercent = typeof body.progress_percent === "number" ? body.progress_percent : null;
  const notes = body.notes ? String(body.notes) : null;
  const estimatedCompletion = body.estimated_completion ? new Date(String(body.estimated_completion)) : null;

  if (progressPercent === null) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "progress_percent is required" } }, 400);
  }

  if (progressPercent < 0 || progressPercent > 100) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "progress_percent must be between 0 and 100" } }, 400);
  }

  if (estimatedCompletion && estimatedCompletion <= new Date()) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "estimated_completion must be a future date" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const taskR = await client.query(
        "SELECT id, status, progress_percent FROM surveyor_tasks WHERE id = $1 AND petugas_id = $2",
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

      const updateFields: string[] = ["progress_percent = $1", "updated_at = NOW()"];
      const updateParams: (string | number | null)[] = [progressPercent];
      let paramIdx = 2;

      if (notes) {
        updateFields.push(`progress_notes = $${paramIdx++}`);
        updateParams.push(notes);
      }

      if (estimatedCompletion) {
        updateFields.push(`estimated_completion = $${paramIdx++}`);
        updateParams.push(estimatedCompletion.toISOString());
      }

      updateParams.push(taskId);

      await client.query(
        `UPDATE surveyor_tasks SET ${updateFields.join(", ")} WHERE id = $${paramIdx}`,
        updateParams
      );

      const afterR = await client.query(
        "SELECT id, status, progress_percent, progress_notes, estimated_completion FROM surveyor_tasks WHERE id = $1",
        [taskId]
      );
      await client.query("COMMIT");

      return { before: taskR.rows[0], after: afterR.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  if (result.invalidStatus) {
    return c.json({ error: { code: "INVALID_STATUS", message: `Cannot update progress for task in '${result.current}' status` } }, 409);
  }

  await appendAudit(c.env, {
    actor: user.sub,
    action: "petugas_task_progress",
    objectType: "petugas_task",
    objectId: taskId,
    after: result.after,
    reason: notes ?? "",
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "petugas_task_progress", err: e }));

  return c.json({
    status: result.after.status,
    progress_percent: result.after.progress_percent,
    progress_notes: result.after.progress_notes,
    estimated_completion: result.after.estimated_completion,
  });
}));
