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
              r.address as report_address, r.created_at as report_created_at,
              'TGS-' || UPPER(LEFT(replace(st.id::text, '-', ''), 8)) AS code,
              EXTRACT(EPOCH FROM (st.deadline - NOW()))/3600 AS sla_hours_remaining,
              CASE
                WHEN r.severity >= 4 AND (st.deadline IS NOT NULL AND st.deadline < NOW() + INTERVAL '24 hours') THEN 'tinggi'
                WHEN r.severity >= 3 OR (st.deadline IS NOT NULL AND st.deadline < NOW() + INTERVAL '48 hours') THEN 'sedang'
                ELSE 'rendah'
              END AS priority,
              std.downloaded_at
       FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       LEFT JOIN LATERAL (
         SELECT MAX(downloaded_at) AS downloaded_at
         FROM surveyor_task_downloads
         WHERE task_id = st.id
       ) std ON true
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
