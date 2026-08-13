import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { getConfig } from "@/config/env";

export const executiveRegionalStatsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

executiveRegionalStatsRoute.get(
  "/",
  requireAuth,
  requireRole("PENGAMBIL_KEPUTUSAN", "ADMIN"),
  safeHandler(async (c) => {
    const stats = await withClient(c.env, async (client) => {
      const slaDefaultDays = getConfig(c.env as unknown as Record<string, string | undefined>).SLA_DEFAULT_DAYS;

      const wilayahStatsR = await client.query(
        `SELECT
           w.id AS wilayah_id,
           w.name AS wilayah_name,
           COUNT(r.id)::int AS total_reports,
           COUNT(r.id) FILTER (WHERE r.status IN ('resolved', 'closed'))::int AS resolved_reports,
           COUNT(r.id) FILTER (WHERE r.status IN ('verified', 'assigned', 'in_progress'))::int AS active_reports,
           COUNT(r.id) FILTER (WHERE r.status IN ('verified', 'assigned', 'in_progress')
             AND r.created_at < NOW() - INTERVAL '${slaDefaultDays} days')::int AS sla_breached,
           AVG(r.severity) FILTER (WHERE r.severity IS NOT NULL)::numeric(10,2) AS avg_severity
         FROM wilayah w
         LEFT JOIN reports r ON r.wilayah_id = w.id
         GROUP BY w.id, w.name
         ORDER BY total_reports DESC`
      );

      const categoryStatsR = await client.query(
        `SELECT
           c.id AS category_id,
           c.name AS category_name,
           c.slug AS category_slug,
           w.id AS wilayah_id,
           w.name AS wilayah_name,
           COUNT(r.id)::int AS report_count
         FROM categories c
         CROSS JOIN wilayah w
         LEFT JOIN reports r ON r.category_id = c.id AND r.wilayah_id = w.id
         GROUP BY c.id, c.name, c.slug, w.id, w.name
         ORDER BY c.name, w.name`
      );

      const wilayahOperatorsR = await client.query(
        `SELECT
           w.id AS wilayah_id,
           w.name AS wilayah_name,
           COUNT(u.id) FILTER (WHERE u.role = 'OPERATOR' AND u.disabled = false AND u.deleted_at IS NULL)::int AS active_operators,
           COUNT(u.id) FILTER (WHERE u.role = 'PETUGAS' AND u.disabled = false AND u.deleted_at IS NULL)::int AS active_petugas
         FROM wilayah w
         LEFT JOIN users u ON u.wilayah_id = w.id
         GROUP BY w.id, w.name
         ORDER BY w.name`
      );

      return {
        by_wilayah: wilayahStatsR.rows.map((row) => ({
          wilayah_id: row.wilayah_id,
          wilayah_name: row.wilayah_name,
          total_reports: row.total_reports,
          resolved_reports: row.resolved_reports,
          active_reports: row.active_reports,
          sla_breached: row.sla_breached,
          avg_severity: row.avg_severity,
          resolution_rate: row.total_reports > 0
            ? Math.round((row.resolved_reports / row.total_reports) * 10000) / 100
            : 0,
        })),
        by_wilayah_category: categoryStatsR.rows.map((row) => ({
          category_id: row.category_id,
          category_name: row.category_name,
          category_slug: row.category_slug,
          wilayah_id: row.wilayah_id,
          wilayah_name: row.wilayah_name,
          report_count: row.report_count,
        })),
        staffing: wilayahOperatorsR.rows.map((row) => ({
          wilayah_id: row.wilayah_id,
          wilayah_name: row.wilayah_name,
          active_operators: row.active_operators,
          active_petugas: row.active_petugas,
        })),
      };
    });

    return c.json(stats);
  }),
);
