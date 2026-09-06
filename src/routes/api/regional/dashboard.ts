import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const regionalDashboardRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

regionalDashboardRoute.get(
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

    // By status
    const byStatusR = await env.D1.prepare(
      "SELECT status, COUNT(*) AS count FROM reports GROUP BY status",
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
    for (const row of byStatusR.results) {
      by_status[row.status as string] = row.count;
    }

    // By category
    const byCategoryR = await env.D1.prepare(
      `SELECT c.id, c.name, c.slug, c.icon, COUNT(*) AS count
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       GROUP BY c.id, c.name, c.slug, c.icon
       ORDER BY count DESC`,
    ).all<{
      id: string;
      name: string;
      slug: string;
      icon: string;
      count: number;
    }>();

    const adminsR = await env.D1.prepare(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL`,
    ).first<{ total: number }>();
    const active_admins = adminsR?.total ?? 0;

    const petugasR = await env.D1.prepare(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'PETUGAS' AND deleted_at IS NULL`,
    ).first<{ total: number }>();
    const active_petugas = petugasR?.total ?? 0;

    // SLA metrics - breached
    const breachedR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND created_at < datetime('now', '-${slaDefaultDays} days')`,
    ).first<{ count: number }>();
    const sla_breached = breachedR?.count ?? 0;

    // SLA metrics - at risk
    const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
    const atRiskR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND created_at < datetime('now', '-${atRiskDays} days')`,
    ).first<{ count: number }>();
    const sla_at_risk = atRiskR?.count ?? 0;

    // Avg verification time
    const avgVerifR = await env.D1.prepare(
      `SELECT COALESCE(AVG((julianday(verified_at) - julianday(created_at))), 0) as avg_verification_days
       FROM reports
       WHERE verified_at IS NOT NULL
         AND created_at > datetime('now', '-30 days')`,
    ).first<{ avg_verification_days: number | null }>();
    const avg_verification_days = avgVerifR?.avg_verification_days ?? 0;

    // Recent submissions (last 7 days)
    const recentR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports WHERE created_at > datetime('now', '-7 days')`,
    ).first<{ count: number }>();
    const recent_submissions = recentR?.count ?? 0;

    // Resolved this month
    const resolvedR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('resolved', 'closed')
         AND updated_at > datetime('now', '-30 days')`,
    ).first<{ count: number }>();
    const resolved_this_month = resolvedR?.count ?? 0;

    return c.json({
      total,
      by_status,
      by_category: byCategoryR.results.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
        count: row.count,
      })),
      active_admins,
      active_petugas,
      sla_breached,
      sla_at_risk,
      avg_verification_days,
      recent_submissions,
      resolved_this_month,
    });
  }),
);
