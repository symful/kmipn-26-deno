import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { getConfig } from "@/config/env";

export const executiveDashboardRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

executiveDashboardRoute.get(
  "/",
  requireAuth,
  requireRole("PENGAMBIL_KEPUTUSAN", "ADMIN"),
  safeHandler(async (c) => {
    const stats = await withClient(c.env, async (client) => {
      const slaDefaultDays = getConfig(c.env as unknown as Record<string, string | undefined>).SLA_DEFAULT_DAYS;

      const totalR = await client.query("SELECT COUNT(*)::int AS total FROM reports");
      const total = totalR.rows[0]?.total ?? 0;

      const byStatusR = await client.query(
        "SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status"
      );
      const by_status: Record<string, number> = {
        draft: 0, submitted: 0, under_review: 0, verified: 0, assigned: 0,
        in_progress: 0, resolved: 0, closed: 0, rejected: 0,
        duplicate_merged: 0, needs_survey: 0,
      };
      for (const row of byStatusR.rows) {
        by_status[row.status as string] = row.count as number;
      }

      const byCategoryR = await client.query(
        `SELECT c.id, c.name, c.slug, c.icon, COUNT(*)::int AS count
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         GROUP BY c.id, c.name, c.slug, c.icon
         ORDER BY count DESC`
      );

      const breachR = await client.query(
        `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < NOW() - INTERVAL '${slaDefaultDays} days'`
      );
      const sla_breached = breachR.rows[0]?.count ?? 0;

      const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
      const atRiskR = await client.query(
        `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < NOW() - INTERVAL '${atRiskDays} days'
           AND created_at >= NOW() - INTERVAL '${slaDefaultDays} days'`
      );
      const sla_at_risk = atRiskR.rows[0]?.count ?? 0;

      const recentSubmissionsR = await client.query(
        `SELECT COUNT(*)::int AS count FROM reports
         WHERE created_at > NOW() - INTERVAL '7 days'`
      );
      const recent_submissions = recentSubmissionsR.rows[0]?.count ?? 0;

      const resolvedThisMonthR = await client.query(
        `SELECT COUNT(*)::int AS count FROM reports
         WHERE status IN ('resolved', 'closed')
           AND updated_at > NOW() - INTERVAL '30 days'`
      );
      const resolved_this_month = resolvedThisMonthR.rows[0]?.count ?? 0;

      const avgVerifR = await client.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (verified_at - created_at))/86400)::numeric(10,2) as avg_verification_days
         FROM reports
         WHERE verified_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '30 days'`
      );
      const avg_verification_days = avgVerifR.rows[0]?.avg_verification_days ?? null;

      const avgResolutionR = await client.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,2) as avg_resolution_days
         FROM reports
         WHERE resolved_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '30 days'`
      );
      const avg_resolution_days = avgResolutionR.rows[0]?.avg_resolution_days ?? null;

      const activeOperatorsR = await client.query(
        `SELECT COUNT(*)::int AS total FROM users
         WHERE role = 'OPERATOR' AND disabled = false AND deleted_at IS NULL`
      );
      const active_operators = activeOperatorsR.rows[0]?.total ?? 0;

      const activePetugasR = await client.query(
        `SELECT COUNT(*)::int AS total FROM users
         WHERE role = 'PETUGAS' AND disabled = false AND deleted_at IS NULL`
      );
      const active_petugas = activePetugasR.rows[0]?.total ?? 0;

      const totalWilayahR = await client.query("SELECT COUNT(*)::int AS total FROM wilayah");
      const total_wilayah = totalWilayahR.rows[0]?.total ?? 0;

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
        sla_breached,
        sla_at_risk,
        recent_submissions,
        resolved_this_month,
        avg_verification_days,
        avg_resolution_days,
        active_operators,
        active_petugas,
        total_wilayah,
      };
    });

    return c.json(stats);
  }),
);
