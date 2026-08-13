import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const petugasTaskDetailRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasTaskDetailRoute.get("/:id", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  const task = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT st.id, st.report_id, st.status, st.deadline, st.progress_percent,
              st.created_at, st.updated_at, st.instructions, st.petugas_id,
              r.description AS report_description, r.lng, r.lat, r.photo_urls,
              r.severity, r.address AS report_address, r.category_id,
              c.name AS category_name, c.slug AS category_slug,
              u.name AS unit_name,
              st.accepted_at, st.started_at, st.completed_at
       FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN units u ON u.id = st.unit_id
       WHERE st.id = $1 AND st.petugas_id = $2`,
      [taskId, user.sub]
    );
    return r.rows[0] ?? null;
  });

  if (!task) {
    return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  }

  const clarifications = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT id, message, response, created_at, responded_at
       FROM task_clarifications
       WHERE task_id = $1
       ORDER BY created_at DESC`,
      [taskId]
    );
    return r.rows;
  });

  const evidence = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT id, photo_urls, notes, created_at
       FROM task_evidence
       WHERE task_id = $1
       ORDER BY created_at DESC`,
      [taskId]
    );
    return r.rows;
  });

  return c.json({ task, clarifications, evidence });
}));
