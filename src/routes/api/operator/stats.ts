import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { getConfig } from "@/config/env";

export const operatorStatsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

operatorStatsRoute.get("/", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const stats = await withClient(c.env, async (client) => {
    const slaDefaultDays = getConfig(c.env as unknown as Record<string, string | undefined>).SLA_DEFAULT_DAYS;

    const totalR = await client.query(
      `SELECT COUNT(*)::int AS total FROM reports WHERE status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')`
    );
    const total = totalR.rows[0]?.total ?? 0;

    const byStatusR = await client.query(
      `SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status`
    );
    const by_status: Record<string, number> = {
      draft: 0, submitted: 0, under_review: 0, verified: 0, assigned: 0,
      in_progress: 0, resolved: 0, closed: 0, rejected: 0,
      duplicate_merged: 0, needs_survey: 0, merged: 0, separated: 0, escalated: 0,
    };
    for (const row of byStatusR.rows) {
      by_status[row.status as string] = row.count as number;
    }

    const bySeverityR = await client.query(
      `SELECT severity, COUNT(*)::int AS count FROM reports WHERE status IN ('verified', 'assigned', 'in_progress', 'escalated') GROUP BY severity`
    );
    const by_severity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of bySeverityR.rows) {
      by_severity[row.severity as string] = row.count as number;
    }

    const breachedR = await client.query(
      `SELECT COUNT(*)::int AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND deadline IS NOT NULL
         AND deadline < NOW()`
    );
    const sla_breached = breachedR.rows[0]?.count ?? 0;

    const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
    const atRiskR = await client.query(
      `SELECT COUNT(*)::int AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND deadline IS NOT NULL
         AND deadline >= NOW()
         AND deadline < NOW() + INTERVAL '${atRiskDays} days'`
    );
    const sla_at_risk = atRiskR.rows[0]?.count ?? 0;

    const avgResolutionR = await client.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,2) as avg_resolution_days
       FROM reports
       WHERE resolved_at IS NOT NULL
         AND created_at > NOW() - INTERVAL '30 days'`
    );
    const avg_resolution_days = avgResolutionR.rows[0]?.avg_resolution_days ?? null;

    const byCategoryR = await client.query(
      `SELECT c.id, c.name, c.slug, COUNT(r.id)::int AS count
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')
       GROUP BY c.id, c.name, c.slug
       ORDER BY count DESC
       LIMIT 10`
    );

    const recentEscalationsR = await client.query(
      `SELECT COUNT(*)::int AS count FROM reports
       WHERE status = 'escalated'
         AND updated_at > NOW() - INTERVAL '7 days'`
    );
    const recent_escalations = recentEscalationsR.rows[0]?.count ?? 0;

    return {
      total,
      by_status,
      by_severity,
      sla_breached,
      sla_at_risk,
      avg_resolution_days,
      by_category: byCategoryR.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        count: row.count,
      })),
      recent_escalations,
    };
  });

  return c.json(stats);
}));
