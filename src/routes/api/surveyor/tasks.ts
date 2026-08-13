import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const surveyorTasksRoute = new Hono<{ Bindings: Env }>();

surveyorTasksRoute.get("/", requireAuth, requireRole("SURVEYOR", "PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const userId = c.get("user").sub;
  const tasks = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT st.*, r.description as report_description, r.lng, r.lat, r.photo_urls, r.severity
       FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       WHERE st.surveyor_id = $1 AND st.status IN ('assigned', 'in_progress')
       ORDER BY st.created_at DESC`,
      [userId]
    );
    return r.rows;
  });
  return c.json({ tasks });
}));
