import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const publicStatsRoute = new Hono<{ Bindings: Env }>();

publicStatsRoute.get(
  "/",
  safeHandler(async (c) => {
    const stats = async () => {
      const totalResult = await c.env.D1.prepare(
        `SELECT COUNT(*) AS total FROM reports`,
      ).first<{ total: number }>();
      const total = Number(totalResult?.total ?? 0);

      const statusResult = await c.env.D1.prepare(
        `SELECT status, COUNT(*) as count FROM reports GROUP BY status`,
      ).all<{ status: string; count: number }>();
      const by_status: Record<string, number> = {};
      for (const row of statusResult.results ?? []) {
        by_status[row.status] = Number(row.count);
      }

      const categoryResult = await c.env.D1.prepare(
        `SELECT category_id, COUNT(*) as count FROM reports WHERE category_id IS NOT NULL GROUP BY category_id`,
      ).all<{ category_id: string; count: number }>();
      const by_category = (categoryResult.results ?? []).map((row) => ({
        category_id: row.category_id,
        count: Number(row.count),
      }));

      const recentResult = await c.env.D1.prepare(
        `SELECT COUNT(*) as recent FROM reports WHERE created_at >= datetime('now', '-7 days')`,
      ).first<{ recent: number }>();
      const recent_reports_7d = Number(recentResult?.recent ?? 0);

      const resolvedResult = await c.env.D1.prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('resolved', 'closed', 'duplicate_merged') THEN 1 ELSE 0 END) as resolved
         FROM reports
         WHERE created_at >= datetime('now', '-7 days')`,
      ).first<{ total: number; resolved: number }>();
      const total7d = Number(resolvedResult?.total ?? 0) || 1;
      const resolved7d = Number(resolvedResult?.resolved ?? 0) || 0;
      const resolution_rate_7d = resolved7d / total7d;

      const slaDefaultDays = getConfig(
        c.env as unknown as Record<string, string | undefined>,
      ).SLA_DEFAULT_DAYS;

      const totalCasesR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports WHERE merged_into IS NULL`,
      ).first<{ count: number }>();
      const total_cases = Number(totalCasesR?.count ?? 0);

      const breachedR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${slaDefaultDays} days')`,
      ).first<{ count: number }>();
      const sla_breached = Number(breachedR?.count ?? 0);

      const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
      const atRiskR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${atRiskDays} days')
           AND created_at >= datetime('now', '-${slaDefaultDays} days')`,
      ).first<{ count: number }>();
      const sla_at_risk = Number(atRiskR?.count ?? 0);

      const totalUnresolvedR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')`,
      ).first<{ count: number }>();
      const total_unresolved = Number(totalUnresolvedR?.count ?? 0);

      const sla_compliance =
        total_unresolved > 0
          ? Math.round(
              ((total_unresolved - sla_breached) / total_unresolved) * 100,
            )
          : 100;

      const bySeverityR = await c.env.D1.prepare(
        `SELECT
           CASE
             WHEN severity IS NULL OR severity <= 25 THEN 'low'
             WHEN severity <= 50 THEN 'medium'
             WHEN severity <= 75 THEN 'high'
             ELSE 'critical'
           END AS bucket,
           COUNT(*) AS count
         FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress', 'needs_survey')
         GROUP BY bucket`,
      ).all<{ bucket: string; count: number }>();
      const by_severity: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      for (const row of bySeverityR.results ?? []) {
        if (row.bucket in by_severity)
          by_severity[row.bucket] = Number(row.count);
      }

      const avgResolutionR = await c.env.D1.prepare(
        `SELECT COALESCE(AVG((julianday(updated_at) - julianday(created_at))), 0) as avg_resolution_days
         FROM reports
         WHERE status IN ('resolved', 'closed')
           AND created_at > datetime('now', '-30 days')`,
      ).first<{ avg_resolution_days: number }>();
      const avg_resolution_days = avgResolutionR?.avg_resolution_days ?? 0;

      const byCategoryNamedR = await c.env.D1.prepare(
        `SELECT c.id, c.name, c.slug, COUNT(r.id) AS count
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')
           AND r.category_id IS NOT NULL
         GROUP BY c.id, c.name, c.slug
         ORDER BY count DESC
         LIMIT 10`,
      ).all<{ id: string; name: string; slug: string; count: number }>();

      const villageR = await c.env.D1.prepare(
        `SELECT kelurahan AS village, kecamatan FROM reports WHERE kelurahan IS NOT NULL AND kelurahan != '' ORDER BY created_at DESC LIMIT 1`,
      ).first<{ village: string; kecamatan: string | null }>();
      const villageName = villageR?.village ?? null;

      const villageCountR = await c.env.D1.prepare(
        `SELECT COUNT(DISTINCT kelurahan) AS count FROM reports WHERE kelurahan IS NOT NULL AND kelurahan != ''`,
      ).first<{ count: number }>();
      const villageCount = Number(villageCountR?.count ?? 0);

      return {
        total,
        total_cases,
        village_name: villageName,
        subdistrict_name: villageR?.kecamatan ?? null,
        region_name:
          [villageName, villageR?.kecamatan].filter(Boolean).join(" · ") ||
          null,
        village_count: villageCount,
        by_status,
        by_category: byCategoryNamedR.results.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          count: Number(row.count),
        })),
        by_severity,
        recent_reports_7d,
        resolution_rate_7d,
        sla_breached,
        sla_at_risk,
        sla_compliance,
        avg_resolution_days,
      };
    };

    return c.json(await stats());
  }),
);
