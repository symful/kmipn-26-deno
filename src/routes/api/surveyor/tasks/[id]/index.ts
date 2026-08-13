import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const surveyorTaskDetailRoute = new Hono<{ Bindings: Env }>();

surveyorTaskDetailRoute.get("/", requireAuth, requireRole("SURVEYOR", "PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const userId = c.get("user").sub;
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  const task = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT st.id, st.surveyor_id, st.report_id, st.status, st.deadline, st.created_at, st.updated_at,
              r.description as report_description, r.lng, r.lat, r.photo_urls, r.severity,
              r.address as report_address, r.created_at as report_created_at
       FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       WHERE st.id = $1 AND st.surveyor_id = $2`,
      [taskId, userId]
    );
    return r.rows[0] ?? null;
  });

  if (!task) {
    return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  }

  return c.json({ task });
}));
