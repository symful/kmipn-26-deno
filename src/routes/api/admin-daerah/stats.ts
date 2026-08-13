import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";
import { getConfig } from "@/config/env";

export const adminDaerahStatsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminDaerahStatsRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const stats = await withClient(c.env, async (client) => {
      const slaDefaultDays = getConfig(c.env as unknown as Record<string, string | undefined>).SLA_DEFAULT_DAYS;

      const { sql: totalSql, params: totalParams } = applyWilayahFilter(
        "SELECT COUNT(*)::int AS total FROM reports",
        [],
        user.wilayah_id,
      );
      const totalR = await client.query(totalSql, totalParams);
      const total = totalR.rows[0]?.total ?? 0;

      const { sql: verifiedSql, params: verifiedParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS count FROM reports WHERE status IN ('verified', 'assigned', 'in_progress')`,
        [],
        user.wilayah_id,
      );
      const verifiedR = await client.query(verifiedSql, verifiedParams);
      const active_cases = verifiedR.rows[0]?.count ?? 0;

      const { sql: resolvedSql, params: resolvedParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS count FROM reports WHERE status IN ('resolved', 'closed')`,
        [],
        user.wilayah_id,
      );
      const resolvedR = await client.query(resolvedSql, resolvedParams);
      const resolved_cases = resolvedR.rows[0]?.count ?? 0;

      const { sql: breachedSql, params: breachedParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < NOW() - INTERVAL '${slaDefaultDays} days'`,
        [],
        user.wilayah_id,
      );
      const breachedR = await client.query(breachedSql, breachedParams);
      const sla_breached = breachedR.rows[0]?.count ?? 0;

      const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
      const { sql: atRiskSql, params: atRiskParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < NOW() - INTERVAL '${atRiskDays} days'`,
        [],
        user.wilayah_id,
      );
      const atRiskR = await client.query(atRiskSql, atRiskParams);
      const sla_at_risk = atRiskR.rows[0]?.count ?? 0;

      const { sql: avgVerifSql, params: avgVerifParams } = applyWilayahFilter(
        `SELECT AVG(EXTRACT(EPOCH FROM (verified_at - created_at))/86400)::numeric(10,2) as avg_verification_days
         FROM reports
         WHERE verified_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '30 days'`,
        [],
        user.wilayah_id,
      );
      const avgVerifR = await client.query(avgVerifSql, avgVerifParams);
      const avg_verification_days = avgVerifR.rows[0]?.avg_verification_days ?? null;

      const { sql: avgResolutionSql, params: avgResolutionParams } = applyWilayahFilter(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,2) as avg_resolution_days
         FROM reports
         WHERE resolved_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '30 days'`,
        [],
        user.wilayah_id,
      );
      const avgResolutionR = await client.query(avgResolutionSql, avgResolutionParams);
      const avg_resolution_days = avgResolutionR.rows[0]?.avg_resolution_days ?? null;

      const { sql: monthlySql, params: monthlyParams } = applyWilayahFilter(
        `SELECT
           DATE_TRUNC('month', created_at) AS month,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS resolved
         FROM reports
         WHERE created_at > NOW() - INTERVAL '12 months'
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY month ASC`,
        [],
        user.wilayah_id,
      );
      const monthlyR = await client.query(monthlySql, monthlyParams);

      return {
        total,
        active_cases,
        resolved_cases,
        sla_breached,
        sla_at_risk,
        avg_verification_days,
        avg_resolution_days,
        monthly_trend: monthlyR.rows.map((row) => ({
          month: row.month,
          total: row.total,
          resolved: row.resolved,
        })),
      };
    });
    return c.json(stats);
  }),
);
