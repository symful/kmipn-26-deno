import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const analyticsRegionalStatsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

analyticsRegionalStatsRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;
    const slaDefaultDays = getConfig(
      env as unknown as Record<string, string | undefined>,
    ).SLA_DEFAULT_DAYS;

    const totalR = await env.D1.prepare(
      "SELECT COUNT(*) AS total FROM reports",
    ).first<{ total: number }>();
    const total = totalR?.total ?? 0;

    const activeR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports WHERE status IN ('verified', 'assigned', 'in_progress')`,
    ).first<{ count: number }>();
    const active_reports = activeR?.count ?? 0;

    const resolvedR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports WHERE status IN ('resolved', 'closed')`,
    ).first<{ count: number }>();
    const resolved_reports = resolvedR?.count ?? 0;

    const breachedR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND created_at < datetime('now', '-${slaDefaultDays} days')`,
    ).first<{ count: number }>();
    const sla_breached = breachedR?.count ?? 0;

    const avgSeverityR = await env.D1.prepare(
      `SELECT AVG(CASE WHEN severity IS NOT NULL THEN severity ELSE NULL END) AS avg_severity
       FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress', 'resolved', 'closed')`,
    ).first<{ avg_severity: number | null }>();
    const avg_severity = avgSeverityR?.avg_severity ?? null;

    const categoryStatsR = await env.D1.prepare(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         c.slug AS category_slug,
         COUNT(r.id) AS report_count
       FROM categories c
       LEFT JOIN reports r ON r.category_id = c.id
       GROUP BY c.id, c.name, c.slug
       ORDER BY report_count DESC`,
    ).all<{
      category_id: string;
      category_name: string;
      category_slug: string;
      report_count: number;
    }>();

    return c.json({
      total_reports: total,
      active_reports,
      resolved_reports,
      sla_breached,
      avg_severity,
      resolution_rate:
        total > 0 ? Math.round((resolved_reports / total) * 10000) / 100 : 0,
      by_category: categoryStatsR.results.map((row) => ({
        category_id: row.category_id,
        category_name: row.category_name,
        category_slug: row.category_slug,
        report_count: row.report_count,
      })),
    });
  }),
);
