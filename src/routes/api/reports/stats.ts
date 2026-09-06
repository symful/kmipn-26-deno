import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const reportsStatsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

reportsStatsRoute.get(
  "/",
  safeHandler(async (c) => {
    const stats = async () => {
      const totalR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS total FROM reports`,
      ).first<{ total: number }>();
      const total = totalR?.total ?? 0;

      const byStatusR = await c.env.D1.prepare(
        `SELECT status, COUNT(*) AS count FROM reports GROUP BY status`,
      ).all<{ status: string; count: number }>();
      const by_status: Record<string, number> = {
        draft: 0,
        submitted: 0,
        under_review: 0,
        verified: 0,
        assigned: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
        rejected: 0,
        duplicate_merged: 0,
        needs_survey: 0,
      };
      for (const row of byStatusR.results ?? []) {
        by_status[row.status as string] = row.count as number;
      }

      const categoryBaseSql = `SELECT c.id, c.name, c.slug, c.icon, COUNT(r.id) AS count
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.category_id IS NOT NULL
       GROUP BY c.id, c.name, c.slug, c.icon ORDER BY count DESC`;

      const byCategoryR = await c.env.D1.prepare(categoryBaseSql).all<{
        id: string;
        name: string;
        slug: string;
        icon: string;
        count: number;
      }>();

      const slaDefaultDays = getConfig(
        c.env as unknown as Record<string, string | undefined>,
      ).SLA_DEFAULT_DAYS;

      const breachedR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${slaDefaultDays} days')`,
      ).first<{ count: number }>();
      const sla_breached = breachedR?.count ?? 0;

      const totalUnresolvedR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')`,
      ).first<{ count: number }>();
      const total_unresolved = totalUnresolvedR?.count ?? 0;

      const sla_compliance =
        total_unresolved > 0
          ? Math.round(
              ((total_unresolved - sla_breached) / total_unresolved) * 100,
            )
          : 100;

      const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
      const atRiskR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${atRiskDays} days')`,
      ).first<{ count: number }>();
      const sla_at_risk = atRiskR?.count ?? 0;

      const avgVerifSql = `SELECT AVG((julianday(verified_at) - julianday(created_at))) * 1.0 AS avg_verification_days
       FROM reports
       WHERE verified_at IS NOT NULL
         AND created_at > datetime('now', '-30 days')`;
      const avgVerifR = await c.env.D1.prepare(avgVerifSql).first<{
        avg_verification_days: number | null;
      }>();
      const avg_verification_days = avgVerifR?.avg_verification_days ?? null;

      const totalCasesR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports WHERE merged_into IS NULL`,
      ).first<{ count: number }>();
      const total_cases = totalCasesR?.count ?? 0;

      return {
        total,
        total_cases,
        by_status,
        by_category:
          byCategoryR.results?.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            icon: row.icon,
            count: row.count,
          })) ?? [],
        sla_breached,
        sla_at_risk,
        sla_compliance,
        avg_verification_days,
      };
    };

    return c.json(await stats());
  }),
);
