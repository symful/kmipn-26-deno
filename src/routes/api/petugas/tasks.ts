import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const petugasTasksRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

petugasTasksRoute.get("/", requireAuth, requireRole("PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const statusParam = c.req.query("status");
  const allowedStatuses = ["assigned", "in_progress", "pending_clarification", "completed"];
  const statuses: string[] = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter((s) => allowedStatuses.includes(s))
    : allowedStatuses;

  let tasks: Record<string, unknown>[] = [];
  try {
    tasks = await withClient(c.env, async (client) => {
      const placeholders = statuses.map((_, i) => `$${i + 1}`).join(", ");
      const r = await client.query(
        `SELECT st.id, st.report_id, st.status, st.deadline, st.progress_percent,
                st.created_at, st.updated_at, st.instructions,
                'TGS-' || UPPER(LEFT(replace(st.id::text, '-', ''), 8)) AS code,
                EXTRACT(EPOCH FROM (st.deadline - NOW()))/3600 AS sla_hours_remaining,
                r.description AS report_description, r.lng, r.lat, r.photo_urls,
                r.severity, r.address AS report_address, r.category_id,
                c.name AS category_name, c.slug AS category_slug,
                u.name AS unit_name
         FROM surveyor_tasks st
         JOIN reports r ON r.id = st.report_id
         LEFT JOIN categories c ON c.id = r.category_id
         LEFT JOIN units u ON u.id = st.unit_id
         WHERE st.petugas_id = $${statuses.length + 1}
           AND st.status IN (${placeholders})
         ORDER BY st.deadline ASC NULLS LAST, st.created_at DESC`,
        [...statuses, user.sub]
      );
      return r.rows ?? [];
    });
  } catch (e) {
    // Return empty array on error rather than 500
    return c.json({ tasks: [] });
  }

  // Sanitize numeric fields that could be NaN
  const sanitized = tasks.map((t) => ({
    ...t,
    sla_hours_remaining: typeof t.sla_hours_remaining === "number" && !Number.isNaN(t.sla_hours_remaining) ? t.sla_hours_remaining : null,
    progress_percent: typeof t.progress_percent === "number" && !Number.isNaN(t.progress_percent) ? t.progress_percent : null,
  }));

  return c.json({ tasks: sanitized });
}));
