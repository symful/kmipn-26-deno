import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const analyticsDashboardRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

analyticsDashboardRoute.get(
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

    const breachR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND created_at < datetime('now', '-${slaDefaultDays} days')`,
    ).first<{ count: number }>();
    const sla_breached = breachR?.count ?? 0;

    const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));
    const atRiskR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('verified', 'assigned', 'in_progress')
         AND created_at < datetime('now', '-${atRiskDays} days')
         AND created_at >= datetime('now', '-${slaDefaultDays} days')`,
    ).first<{ count: number }>();
    const sla_at_risk = atRiskR?.count ?? 0;

    const recentSubmissionsR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE created_at > datetime('now', '-7 days')`,
    ).first<{ count: number }>();
    const recent_submissions = recentSubmissionsR?.count ?? 0;

    const resolvedThisMonthR = await env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports
       WHERE status IN ('resolved', 'closed')
         AND updated_at > datetime('now', '-30 days')`,
    ).first<{ count: number }>();
    const resolved_this_month = resolvedThisMonthR?.count ?? 0;

    const avgVerifR = await env.D1.prepare(
      `SELECT AVG((julianday(verified_at) - julianday(created_at))) as avg_verification_days
       FROM reports
       WHERE verified_at IS NOT NULL
         AND created_at > datetime('now', '-30 days')`,
    ).first<{ avg_verification_days: number | null }>();
    const avg_verification_days = avgVerifR?.avg_verification_days ?? null;

    const avgResolutionR = await env.D1.prepare(
      `SELECT AVG((julianday(updated_at) - julianday(created_at))) as avg_resolution_days
       FROM reports
       WHERE status IN ('resolved', 'closed')
         AND created_at > datetime('now', '-30 days')`,
    ).first<{ avg_resolution_days: number | null }>();
    const avg_resolution_days = avgResolutionR?.avg_resolution_days ?? null;

    const activeAdminsR = await env.D1.prepare(
      `SELECT COUNT(*) AS total FROM users
       WHERE role = 'ADMIN' AND disabled = false AND deleted_at IS NULL`,
    ).first<{ total: number }>();
    const active_admins = activeAdminsR?.total ?? 0;

    const activePetugasR = await env.D1.prepare(
      `SELECT COUNT(*) AS total FROM users
       WHERE role = 'PETUGAS' AND disabled = false AND deleted_at IS NULL`,
    ).first<{ total: number }>();
    const active_petugas = activePetugasR?.total ?? 0;

    const verified_reports = by_status["verified"] ?? 0;
    const resolved_reports = resolved_this_month;
    const active_reports =
      (by_status.verified ?? 0) +
      (by_status.assigned ?? 0) +
      (by_status.in_progress ?? 0);
    const sla_breach_rate =
      active_reports > 0
        ? Math.round((sla_breached / active_reports) * 10000) / 100
        : 0;

    return c.json({
      total_reports: total,
      verified_reports,
      resolved_reports,
      avg_resolution_days: avg_resolution_days ?? 0,
      sla_breach_rate,
      sla_breached,
      sla_at_risk,
      active_reports,
      recent_submissions,
      resolved_this_month,
      avg_verification_days,
      active_admins,
      active_petugas,
      reports_by_status: by_status,
      reports_by_category: byCategoryR.results.map((row) => ({
        category_id: row.id,
        category_name: row.name,
        category_slug: row.slug,
        icon: row.icon,
        count: row.count,
      })),
    });
  }),
);
