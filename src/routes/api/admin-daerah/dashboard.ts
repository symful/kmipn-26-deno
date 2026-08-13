import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";
import { getConfig } from "@/config/env";

/**
 * Dashboard stats for ADMIN_DAERAH — scoped to user's wilayah.
 * ADMIN sees all, ADMIN_DAERAH sees only their wilayah.
 */
export const adminDaerahDashboardRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminDaerahDashboardRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const stats = await withClient(c.env, async (client) => {
      // Total reports in wilayah
      const { sql: totalSql, params: totalParams } = applyWilayahFilter(
        "SELECT COUNT(*)::int AS total FROM reports",
        [],
        user.wilayah_id,
      );
      const totalR = await client.query(totalSql, totalParams);
      const total = totalR.rows[0]?.total ?? 0;

      // By status
      const { sql: byStatusSql, params: byStatusParams } = applyWilayahFilter(
        "SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status",
        [],
        user.wilayah_id,
      );
      const byStatusR = await client.query(byStatusSql, byStatusParams);
      const by_status: Record<string, number> = {
        draft: 0, submitted: 0, under_review: 0, verified: 0, assigned: 0,
        in_progress: 0, resolved: 0, closed: 0, rejected: 0,
        duplicate_merged: 0, needs_survey: 0,
      };
      for (const row of byStatusR.rows) {
        by_status[row.status as string] = row.count as number;
      }

      // By category
      const { sql: byCategorySql, params: byCategoryParams } = applyWilayahFilter(
        `SELECT c.id, c.name, c.slug, c.icon, COUNT(*)::int AS count
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         GROUP BY c.id, c.name, c.slug, c.icon
         ORDER BY count DESC`,
        [],
        user.wilayah_id,
      );
      const byCategoryR = await client.query(byCategorySql, byCategoryParams);

      // Active operators in this wilayah
      const { sql: operatorsSql, params: operatorsParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE role = 'OPERATOR' AND disabled = false AND deleted_at IS NULL`,
        [],
        user.wilayah_id,
      );
      const operatorsR = await client.query(operatorsSql, operatorsParams);
      const active_operators = operatorsR.rows[0]?.total ?? 0;

      // Active petugas in this wilayah
      const { sql: petugasSql, params: petugasParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE role = 'PETUGAS' AND disabled = false AND deleted_at IS NULL`,
        [],
        user.wilayah_id,
      );
      const petugasR = await client.query(petugasSql, petugasParams);
      const active_petugas = petugasR.rows[0]?.total ?? 0;

      // SLA metrics
      const slaDefaultDays = getConfig(c.env as unknown as Record<string, string | undefined>).SLA_DEFAULT_DAYS;

      const breachedBase = `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < NOW() - INTERVAL '${slaDefaultDays} days'`;
      const { sql: breachedSql, params: breachedFinalParams } = applyWilayahFilter(
        breachedBase,
        [],
        user.wilayah_id,
      );
      const breachedR = await client.query(breachedSql, breachedFinalParams);
      const sla_breached = breachedR.rows[0]?.count ?? 0;

      const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
      const atRiskBase = `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < NOW() - INTERVAL '${atRiskDays} days'`;
      const { sql: atRiskSql, params: atRiskFinalParams } = applyWilayahFilter(
        atRiskBase,
        [],
        user.wilayah_id,
      );
      const atRiskR = await client.query(atRiskSql, atRiskFinalParams);
      const sla_at_risk = atRiskR.rows[0]?.count ?? 0;

      // Avg verification time
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

      // Recent submissions (last 7 days)
      const { sql: recentSql, params: recentParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS count
         FROM reports
         WHERE created_at > NOW() - INTERVAL '7 days'`,
        [],
        user.wilayah_id,
      );
      const recentR = await client.query(recentSql, recentParams);
      const recent_submissions = recentR.rows[0]?.count ?? 0;

      // Resolved this month
      const { sql: resolvedSql, params: resolvedParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS count
         FROM reports
         WHERE status IN ('resolved', 'closed')
           AND updated_at > NOW() - INTERVAL '30 days'`,
        [],
        user.wilayah_id,
      );
      const resolvedR = await client.query(resolvedSql, resolvedParams);
      const resolved_this_month = resolvedR.rows[0]?.count ?? 0;

      return {
        total,
        by_status,
        by_category: byCategoryR.rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          icon: row.icon,
          count: row.count,
        })),
        active_operators,
        active_petugas,
        sla_breached,
        sla_at_risk,
        avg_verification_days,
        recent_submissions,
        resolved_this_month,
      };
    });
    return c.json(stats);
  }),
);
