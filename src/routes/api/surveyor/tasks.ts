import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const surveyorTasksRoute = new Hono<{ Bindings: Env }>();

surveyorTasksRoute.get("/", requireAuth, requireRole("SURVEYOR", "PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const userId = c.get("user").sub;
  
  // Query params
  const filter = c.req.query("filter");
  const statusFilter = c.req.query("status");
  const sort = c.req.query("sort");

  const tasks = await withClient(c.env, async (client) => {
    // Build WHERE clause
    const conditions: string[] = [`st.surveyor_id = $1`];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    // Status override or default
    if (statusFilter) {
      conditions.push(`st.status = $${paramIndex++}`);
      params.push(statusFilter);
    } else {
      conditions.push(`st.status IN ('assigned', 'in_progress')`);
    }

    // Filter: today (deadline is today)
    if (filter === "today") {
      conditions.push(`DATE(st.deadline) = CURRENT_DATE`);
    }
    // Filter: overdue (past deadline)
    else if (filter === "overdue") {
      conditions.push(`st.deadline < NOW()`);
    }
    // Filter: not_downloaded
    else if (filter === "not_downloaded") {
      conditions.push(`std.downloaded_at IS NULL`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Build ORDER BY
    let orderClause = "st.created_at DESC";
    if (sort === "sla_asc") {
      orderClause = "st.deadline ASC NULLS LAST";
    } else if (sort === "deadline_asc") {
      orderClause = "st.deadline ASC NULLS LAST";
    }

    const r = await client.query(
      `SELECT
         st.id,
         st.report_id,
         st.surveyor_id,
         st.petugas_id,
         st.unit_id,
         st.instructions,
         st.deadline,
         st.status,
         st.progress_percent,
         st.progress_notes,
         st.estimated_completion,
         st.accepted_at,
         st.started_at,
         st.completed_at,
         st.verification_status,
         st.verified_by,
         st.verified_at,
         st.created_at,
         st.updated_at,
         'TGS-' || UPPER(LEFT(replace(st.id::text, '-', ''), 8)) AS code,
         EXTRACT(EPOCH FROM (st.deadline - NOW()))/3600 AS sla_hours_remaining,
         CASE
           WHEN r.severity >= 4 AND (st.deadline IS NOT NULL AND st.deadline < NOW() + INTERVAL '24 hours') THEN 'tinggi'
           WHEN r.severity >= 3 OR (st.deadline IS NOT NULL AND st.deadline < NOW() + INTERVAL '48 hours') THEN 'sedang'
           ELSE 'rendah'
         END AS priority,
         r.description AS report_description,
         r.lng,
         r.lat,
         r.photo_urls,
         r.severity,
         r.address,
         r.category_id,
         c.name AS category_name,
         c.slug AS category_slug,
         std.downloaded_at
       FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN LATERAL (
         SELECT MAX(downloaded_at) AS downloaded_at
         FROM surveyor_task_downloads
         WHERE task_id = st.id
       ) std ON true
       ${whereClause}
       ORDER BY ${orderClause}`,
      params
    );
    return r.rows;
  });
  return c.json({ tasks });
}));
