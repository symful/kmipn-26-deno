import { REPORT_AREA_SQL } from "@/lib/report-area";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import {
  normalizeReportsPhotoUrls,
  normalizeTasksEvidenceUrls,
} from "@/lib/photo-urls";

export const tasksRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

tasksRoute.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const role = user.role;

    if (role === "PETUGAS") {
      const userId = user.sub;
      const filter = c.req.query("filter");
      const statusFilter = c.req.query("status");
      const reportIdFilter = c.req.query("report_id");
      const sort = c.req.query("sort");

      const conditions: string[] = [
        `(st.assigned_to = ? OR st.worker_id = ? OR (st.assigned_to IS NULL AND st.worker_id IS NULL AND st.unit_id IS NOT NULL))`,
      ];
      const params: unknown[] = [userId, userId];

      if (reportIdFilter) {
        conditions.push(`st.report_id = ?`);
        params.push(reportIdFilter);
      }

      if (statusFilter) {
        conditions.push(`st.status = ?`);
        params.push(statusFilter);
      } else {
        conditions.push(
          `st.status IN ('assigned', 'accepted', 'in_progress', 'pending_clarification', 'completed')`,
        );
      }

      if (filter === "today") {
        conditions.push(`DATE(st.deadline) = CURRENT_DATE`);
      } else if (filter === "overdue") {
        conditions.push(`st.deadline < (datetime('now'))`);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      let orderClause = "st.created_at DESC";
      if (sort === "sla_asc" || sort === "deadline_asc") {
        orderClause =
          "CASE WHEN st.deadline IS NULL THEN 1 ELSE 0 END, st.deadline ASC";
      }

      const tasksR = await c.env.D1.prepare(
        `SELECT
         st.id,
         tm.task_type,
         st.report_id,
         st.assigned_to,
         st.worker_id,
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
         st.completion_evidence_urls,
         st.resolution_evidence_urls,
         st.created_at,
         st.updated_at,
         'TGS-' || UPPER(substr(replace(st.id, '-', ''), 1, 8)) AS code,
         (julianday(st.deadline) - julianday('now')) * 24 AS sla_hours_remaining,
         CASE
           WHEN r.severity >= 75 OR r.priority >= 4 OR (st.deadline IS NOT NULL AND st.deadline < (datetime('now', '+24 hours'))) THEN 'tinggi'
           WHEN r.severity >= 50 OR (st.deadline IS NOT NULL AND st.deadline < (datetime('now', '+48 hours'))) THEN 'sedang'
           ELSE 'rendah'
         END AS priority,
         r.description AS report_description,
         r.title AS report_title,
         u.nama AS unit_name, assigned_user.name AS assigned_to_name, worker_user.name AS worker_name,
         r.lng,
         r.lat,
         r.photo_urls,
         r.severity,
          ${REPORT_AREA_SQL} AS address,
         r.category_id,
         c.name AS category_name,
          c.slug AS category_slug
        FROM tasks st
        JOIN reports r ON r.id = st.report_id
        LEFT JOIN categories c ON c.id = r.category_id
        LEFT JOIN units u ON u.id = st.unit_id
     LEFT JOIN users assigned_user ON assigned_user.id = st.assigned_to
     LEFT JOIN users worker_user ON worker_user.id = st.worker_id
        LEFT JOIN task_metadata tm ON tm.task_id = st.id
        ${whereClause}
        ORDER BY ${orderClause}`,
      )
        .bind(...params)
        .all();
      const tasks = tasksR.results ?? [];
      return c.json({
        data: normalizeTasksEvidenceUrls(
          normalizeReportsPhotoUrls(tasks as { photo_urls?: unknown }[]),
        ),
      });
    }

    const statusParam = c.req.query("status");
    const reportIdParam = c.req.query("report_id");
    const allowedStatuses = [
      "assigned",
      "accepted",
      "in_progress",
      "pending_clarification",
      "completed",
      "rejected",
    ];
    const statuses: string[] = statusParam
      ? statusParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => allowedStatuses.includes(s))
      : allowedStatuses;

    if (statuses.length === 0)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Status tugas tidak valid",
          },
        },
        400,
      );

    const placeholders = statuses.map(() => "?").join(", ");
    const bindings: unknown[] = [...statuses];

    const extraConditions: string[] = [];
    if (reportIdParam) {
      extraConditions.push(`st.report_id = ?`);
      bindings.push(reportIdParam);
    }
    const extraWhere = extraConditions.length
      ? ` AND ${extraConditions.join(" AND ")}`
      : "";

    const result = await c.env.D1.prepare(
      `SELECT st.id, st.report_id, st.status, st.deadline, st.progress_percent,
            tm.task_type,
            st.created_at, st.updated_at, st.instructions, st.assigned_to, st.worker_id, st.unit_id,
            st.progress_notes, st.estimated_completion, st.accepted_at, st.started_at, st.completed_at,
            st.verification_status, st.verified_by, st.verified_at, st.completion_evidence_urls, st.resolution_evidence_urls,
            'TGS-' || UPPER(SUBSTR(replace(st.id, '-', ''), 1, 8)) AS code,
            (julianday(st.deadline) - julianday('now')) * 24 AS sla_hours_remaining,
            r.description AS report_description, r.title AS report_title, r.lng, r.lat, r.photo_urls,
            r.severity, ${REPORT_AREA_SQL} AS report_address, r.category_id,
            c.name AS category_name, c.slug AS category_slug,
            u.nama AS unit_name, assigned_user.name AS assigned_to_name, worker_user.name AS worker_name
     FROM tasks st
     JOIN reports r ON r.id = st.report_id
     LEFT JOIN categories c ON c.id = r.category_id
     LEFT JOIN units u ON u.id = st.unit_id
     LEFT JOIN users assigned_user ON assigned_user.id = st.assigned_to
     LEFT JOIN users worker_user ON worker_user.id = st.worker_id
     LEFT JOIN task_metadata tm ON tm.task_id = st.id
     WHERE st.status IN (${placeholders})${extraWhere}
     ORDER BY st.deadline IS NOT NULL DESC, st.deadline ASC, st.created_at DESC`,
    )
      .bind(...bindings)
      .all<Record<string, unknown>>();

    const tasks = result.results ?? [];
    const sanitized = tasks.map((t) => ({
      ...t,
      sla_hours_remaining:
        typeof t.sla_hours_remaining === "number" &&
        !Number.isNaN(t.sla_hours_remaining)
          ? t.sla_hours_remaining
          : null,
      progress_percent:
        typeof t.progress_percent === "number" &&
        !Number.isNaN(t.progress_percent)
          ? t.progress_percent
          : null,
    }));

    return c.json({
      data: normalizeTasksEvidenceUrls(
        normalizeReportsPhotoUrls(sanitized as { photo_urls?: unknown }[]),
      ),
    });
  }),
);
