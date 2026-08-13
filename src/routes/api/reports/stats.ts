import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";
import { getConfig } from "@/config/env";

export const reportsStatsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

reportsStatsRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR", "VERIFIKATOR", "PENGAMBIL_KEPUTUSAN", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const stats = await withClient(c.env, async (client) => {
      const { sql: totalSql, params: totalParams } = applyWilayahFilter(
        "SELECT COUNT(*)::int AS total FROM reports",
        [],
        user.wilayah_id,
      );
      const totalR = await client.query(totalSql, totalParams);
      const total = totalR.rows[0]?.total ?? 0;

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

      const byWilayahR = await client.query(
        `SELECT w.id as wilayah_id, w.name, COUNT(r.id)::int as count
         FROM wilayah w
         LEFT JOIN reports r ON r.wilayah_id = w.id AND r.status IN ('verified', 'resolved', 'closed')
         WHERE w.parent_id IS NULL OR w.level = 'kabupaten'
         GROUP BY w.id, w.name
         ORDER BY count DESC
         LIMIT 50`
      );

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
        by_wilayah: byWilayahR.rows.map((row) => ({
          id: row.wilayah_id,
          name: row.name,
          count: row.count,
        })),
        sla_breached,
        sla_at_risk,
        avg_verification_days,
      };
    });
    return c.json(stats);
  }),
);
