import { getSyncStatus } from "@/lib/sync-status";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const statsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

statsRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;
    const role = c.get("user").role;
    const slaDefaultDays = getConfig(
      env as unknown as Record<string, string | undefined>,
    ).SLA_DEFAULT_DAYS;
    const atRiskDays = Math.max(1, Math.floor(slaDefaultDays / 2));

    const payload: Record<string, unknown> = {};

    if (role === "WARGA") {
      const rows = await env.D1.prepare(
        "SELECT status, COUNT(*) AS count FROM reports WHERE reporter_id = ? GROUP BY status",
      )
        .bind(c.get("user").sub)
        .all<{ status: string; count: number }>();
      const byStatus: Record<string, number> = {};
      for (const row of rows.results ?? [])
        byStatus[row.status] = Number(row.count);
      const processing = [
        "submitted",
        "under_review",
        "verified",
        "assigned",
        "in_progress",
        "needs_survey",
        "escalated",
      ].reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
      return c.json({
        total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        by_status: byStatus,
        needs_completion: byStatus.needs_completion ?? 0,
        processing,
        completed: (byStatus.resolved ?? 0) + (byStatus.closed ?? 0),
      });
    }

    if (role === "ADMIN") {
      const newReports = await env.D1.prepare(
        "SELECT COUNT(*) as cnt FROM reports WHERE status = 'submitted'",
      ).first<{ cnt: number }>();

      const needsVerification = await env.D1.prepare(
        "SELECT COUNT(*) as cnt FROM reports WHERE status IN ('under_review', 'needs_survey', 'needs_completion')",
      ).first<{ cnt: number }>();

      const slaBreached = await env.D1.prepare(
        "SELECT COUNT(*) as cnt FROM reports WHERE deadline < datetime('now') AND status NOT IN ('resolved', 'closed')",
      ).first<{ cnt: number }>();

      const highPriority = await env.D1.prepare(
        "SELECT COUNT(*) as cnt FROM reports r JOIN priority_scores ps ON ps.report_id = r.id WHERE COALESCE(ps.override_score, ps.computed_score) >= 80 AND r.status NOT IN ('resolved', 'closed', 'rejected', 'merged', 'duplicate_merged')",
      ).first<{ cnt: number }>();

      const needsCompletion = await env.D1.prepare(
        "SELECT COUNT(*) as cnt FROM reports WHERE status = 'needs_completion'",
      ).first<{ cnt: number }>();

      payload.queue_counts = {
        new_reports: Number(newReports?.cnt ?? 0),
        needs_verification: Number(needsVerification?.cnt ?? 0),
        sla_breached: Number(slaBreached?.cnt ?? 0),
        high_priority: Number(highPriority?.cnt ?? 0),
        needs_completion: Number(needsCompletion?.cnt ?? 0),
      };
      const attention = await env.D1.prepare(
        `SELECT r.id, r.title, r.description, r.status, r.kelurahan, r.deadline, c.name AS category,
          CAST(COALESCE(ps.override_score, ps.computed_score) AS INTEGER) AS priority_score,
          1 + (SELECT COUNT(*) FROM reports supporting WHERE supporting.merged_into = r.id) AS supporting_count
        FROM reports r JOIN priority_scores ps ON ps.report_id = r.id LEFT JOIN categories c ON c.id = r.category_id
        WHERE COALESCE(ps.override_score, ps.computed_score) >= 80 AND r.status NOT IN ('resolved', 'closed', 'rejected', 'merged', 'duplicate_merged')
        ORDER BY COALESCE(ps.override_score, ps.computed_score) DESC, r.created_at ASC LIMIT 4`,
      ).all();
      payload.attention_cases = attention.results ?? [];

      const totalReportsR = await env.D1.prepare(
        "SELECT COUNT(*) as cnt FROM reports",
      ).first<{ cnt: number }>();
      const totalReports = totalReportsR?.cnt ?? 0;

      payload.sync_stats = {
        ...(await getSyncStatus(env)),
        received_reports: totalReports,
      };
    }

    if (role === "ADMIN") {
      const totalR = await env.D1.prepare(
        `SELECT COUNT(*) AS total FROM reports WHERE status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')`,
      ).first<{ total: number }>();
      const total = totalR?.total ?? 0;

      const byStatusR = await env.D1.prepare(
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
        merged: 0,
        separated: 0,
        escalated: 0,
      };
      for (const row of byStatusR.results) {
        by_status[row.status as string] = row.count;
      }

      const bySeverityR = await env.D1.prepare(
        `SELECT
           CASE
             WHEN severity IS NULL OR severity <= 25 THEN 'low'
             WHEN severity <= 50 THEN 'medium'
             WHEN severity <= 75 THEN 'high'
             ELSE 'critical'
           END AS bucket,
           COUNT(*) AS count
         FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress', 'escalated')
         GROUP BY bucket`,
      ).all<{ bucket: string; count: number }>();
      const by_severity: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      for (const row of bySeverityR.results) {
        if (row.bucket in by_severity) by_severity[row.bucket] = row.count;
      }

      const breachedR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND deadline IS NOT NULL
           AND deadline < datetime('now')`,
      ).first<{ count: number }>();
      const sla_breached = breachedR?.count ?? 0;

      const atRiskR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND deadline IS NOT NULL
           AND deadline >= datetime('now')
           AND deadline < datetime('now', '+${atRiskDays} days')`,
      ).first<{ count: number }>();
      const sla_at_risk = atRiskR?.count ?? 0;

      const avgResolutionR = await env.D1.prepare(
        `SELECT COALESCE(AVG((julianday(updated_at) - julianday(created_at))), 0) as avg_resolution_days
         FROM reports
         WHERE status IN ('resolved', 'closed')
           AND created_at > datetime('now', '-30 days')`,
      ).first<{ avg_resolution_days: number }>();
      if (!avgResolutionR)
        throw new Error("avg_resolution_days query returned no rows");
      const avg_resolution_days = avgResolutionR.avg_resolution_days;

      const byCategoryR = await env.D1.prepare(
        `SELECT c.id, c.name, c.slug, COUNT(r.id) AS count
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')
           AND r.category_id IS NOT NULL
         GROUP BY c.id, c.name, c.slug
         ORDER BY count DESC
         LIMIT 10`,
      ).all<{ id: string; name: string; slug: string; count: number }>();

      const recentEscalationsR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status = 'escalated'
           AND updated_at > datetime('now', '-7 days')`,
      ).first<{ count: number }>();
      const recent_escalations = recentEscalationsR?.count ?? 0;

      const backlogDays = Math.min(
        90,
        Math.max(1, parseInt(String(c.req.query("days") ?? "30"), 10)),
      );
      const backlogR = await env.D1.prepare(
        `WITH RECURSIVE date_range AS (
           SELECT date('now', '-' || ? || ' days') as day
           UNION ALL
           SELECT date(day, '+1 day') FROM date_range WHERE day < date('now')
         ),
         daily AS (
           SELECT
             date(created_at) as day,
             COUNT(*) as laporan_count,
             SUM(CASE WHEN status NOT IN ('resolved', 'closed', 'rejected', 'merged', 'duplicate_merged') THEN 1 ELSE 0 END) as kasus_count
           FROM reports
           WHERE created_at >= datetime('now', '-' || ? || ' days')
           GROUP BY date(created_at)
         )
         SELECT dr.day, COALESCE(d.laporan_count, 0) as laporan_count, COALESCE(d.kasus_count, 0) as kasus_count,
           (SELECT COUNT(*) FROM reports completed WHERE completed.status IN ('resolved', 'closed') AND date(completed.updated_at) = dr.day) AS completed_count
         FROM date_range dr
         LEFT JOIN daily d ON d.day = dr.day
         ORDER BY dr.day ASC`,
      )
        .bind(backlogDays - 1, backlogDays)
        .all<{
          day: string;
          laporan_count: number;
          kasus_count: number;
          completed_count: number;
        }>();

      payload.buckets = backlogR.results ?? [];

      payload.total = total;
      payload.by_status = by_status;
      payload.by_severity = by_severity;
      payload.sla_breached = sla_breached;
      payload.sla_at_risk = sla_at_risk;
      payload.avg_resolution_days = avg_resolution_days;
      payload.by_category = byCategoryR.results.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        count: row.count,
      }));
      payload.recent_escalations = recent_escalations;
    }

    if (role === "ADMIN") {
      const totalReportsR = await env.D1.prepare(
        `SELECT COUNT(*) AS total FROM reports WHERE status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')`,
      ).first<{ total: number }>();
      const total_reports = totalReportsR?.total ?? 0;

      const dashByStatusR = await env.D1.prepare(
        `SELECT status, COUNT(*) AS count FROM reports GROUP BY status`,
      ).all<{ status: string; count: number }>();
      const dash_by_status: Record<string, number> = {
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
        merged: 0,
        separated: 0,
        escalated: 0,
      };
      for (const row of dashByStatusR.results) {
        dash_by_status[row.status as string] = row.count;
      }

      const dashBySeverityR = await env.D1.prepare(
        `SELECT
           CASE
             WHEN severity IS NULL OR severity <= 25 THEN 'low'
             WHEN severity <= 50 THEN 'medium'
             WHEN severity <= 75 THEN 'high'
             ELSE 'critical'
           END AS bucket,
           COUNT(*) AS count
         FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress', 'escalated', 'needs_survey')
         GROUP BY bucket`,
      ).all<{ bucket: string; count: number }>();
      const dash_by_severity: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      for (const row of dashBySeverityR.results) {
        if (row.bucket in dash_by_severity)
          dash_by_severity[row.bucket] = row.count;
      }

      const dashBreachedR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND deadline IS NOT NULL
           AND deadline < datetime('now')`,
      ).first<{ count: number }>();
      const dash_sla_breached = dashBreachedR?.count ?? 0;

      const dashAtRiskR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND deadline IS NOT NULL
           AND deadline >= datetime('now')
           AND deadline < datetime('now', '+${atRiskDays} days')`,
      ).first<{ count: number }>();
      const dash_sla_at_risk = dashAtRiskR?.count ?? 0;

      const recentR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE created_at > datetime('now', '-7 days')`,
      ).first<{ count: number }>();
      const recent_submissions = recentR?.count ?? 0;

      const topCategoriesR = await env.D1.prepare(
        `SELECT c.id, c.name, c.slug, COUNT(r.id) AS count
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.status NOT IN ('closed', 'rejected', 'merged', 'duplicate_merged')
           AND r.category_id IS NOT NULL
         GROUP BY c.id, c.name, c.slug
         ORDER BY count DESC
         LIMIT 10`,
      ).all<{ id: string; name: string; slug: string; count: number }>();

      const avgVerifR = await env.D1.prepare(
        `SELECT COALESCE(AVG((julianday(verified_at) - julianday(created_at))), 0) * 1.0 AS avg_verification_days
         FROM reports
         WHERE verified_at IS NOT NULL
           AND created_at > datetime('now', '-30 days')`,
      ).first<{ avg_verification_days: number }>();
      if (!avgVerifR)
        throw new Error("avg_verification_days query returned no rows");
      const avg_verification_days = avgVerifR.avg_verification_days;

      payload.total = total_reports;
      payload.by_category = topCategoriesR.results.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        count: row.count,
      }));
      payload.by_severity = dash_by_severity;
      payload.sla_breached = dash_sla_breached;
      payload.sla_at_risk = dash_sla_at_risk;
      payload.avg_verification_days = avg_verification_days;
    }

    if ((role as string) === "ADMIN") {
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

      const adminsR = await env.D1.prepare(
        `SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL`,
      ).first<{ total: number }>();
      const active_admins = adminsR?.total ?? 0;

      const petugasR = await env.D1.prepare(
        `SELECT COUNT(*) AS total FROM users WHERE role = 'PETUGAS' AND deleted_at IS NULL`,
      ).first<{ total: number }>();
      const active_petugas = petugasR?.total ?? 0;

      const breachedR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${slaDefaultDays} days')`,
      ).first<{ count: number }>();
      const sla_breached = breachedR?.count ?? 0;

      const atRiskR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${atRiskDays} days')`,
      ).first<{ count: number }>();
      const sla_at_risk = atRiskR?.count ?? 0;

      const avgVerifR = await env.D1.prepare(
        `SELECT COALESCE(AVG((julianday(verified_at) - julianday(created_at))), 0) as avg_verification_days
         FROM reports
         WHERE verified_at IS NOT NULL
           AND created_at > datetime('now', '-30 days')`,
      ).first<{ avg_verification_days: number }>();
      if (!avgVerifR)
        throw new Error("avg_verification_days query returned no rows");
      const avg_verification_days = avgVerifR.avg_verification_days;

      const recentR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports WHERE created_at > datetime('now', '-7 days')`,
      ).first<{ count: number }>();
      const recent_submissions = recentR?.count ?? 0;

      const resolvedR = await env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('resolved', 'closed')
           AND updated_at > datetime('now', '-30 days')`,
      ).first<{ count: number }>();
      const resolved_this_month = resolvedR?.count ?? 0;

      payload.region_dashboard = {
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
      };

      const verifiedR = await env.D1.prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status IN ('verified', 'assigned', 'in_progress')",
      ).first<{ count: number }>();
      const active_cases = verifiedR?.count ?? 0;

      const resolvedCasesR = await env.D1.prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status IN ('resolved', 'closed')",
      ).first<{ count: number }>();
      const resolved_cases = resolvedCasesR?.count ?? 0;

      const avgResolutionR = await env.D1.prepare(
        `SELECT COALESCE(AVG((julianday(updated_at) - julianday(created_at))), 0) as avg_resolution_days
         FROM reports
         WHERE status IN ('resolved', 'closed')
           AND created_at > datetime('now', '-30 days')`,
      ).first<{ avg_resolution_days: number }>();
      if (!avgResolutionR)
        throw new Error("avg_resolution_days query returned no rows");
      const avg_resolution_days = avgResolutionR.avg_resolution_days;

      const monthlyR = await env.D1.prepare(
        `SELECT
           strftime('%Y-%m', created_at) AS month,
           COUNT(*) AS total,
           SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved
         FROM reports
         WHERE created_at > datetime('now', '-12 months')
         GROUP BY strftime('%Y-%m', created_at)
         ORDER BY month ASC`,
      ).all<{ month: string; total: number; resolved: number }>();

      payload.region_stats = {
        total,
        active_cases,
        resolved_cases,
        sla_breached,
        sla_at_risk,
        avg_verification_days,
        avg_resolution_days,
        monthly_trend: monthlyR.results.map((row) => ({
          month: row.month,
          total: row.total,
          resolved: row.resolved,
        })),
      };
    }

    if (role === "ADMIN") {
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
       GROUP BY c.id, c.name, c.slug, c.icon ORDER BY count DESC`;

      const byCategoryR = await c.env.D1.prepare(categoryBaseSql).all<{
        id: string;
        name: string;
        slug: string;
        icon: string;
        count: number;
      }>();

      const breachedR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${slaDefaultDays} days')`,
      ).first<{ count: number }>();
      const sla_breached = breachedR?.count ?? 0;

      const atRiskR = await c.env.D1.prepare(
        `SELECT COUNT(*) AS count FROM reports
         WHERE status IN ('verified', 'assigned', 'in_progress')
           AND created_at < datetime('now', '-${atRiskDays} days')`,
      ).first<{ count: number }>();
      const sla_at_risk = atRiskR?.count ?? 0;

      const avgVerifSql = `SELECT COALESCE(AVG((julianday(verified_at) - julianday(created_at))), 0) * 1.0 AS avg_verification_days
       FROM reports
       WHERE verified_at IS NOT NULL
         AND created_at > datetime('now', '-30 days')`;
      const avgVerifR = await c.env.D1.prepare(avgVerifSql).first<{
        avg_verification_days: number;
      }>();
      if (!avgVerifR)
        throw new Error("avg_verification_days query returned no rows");
      const avg_verification_days = avgVerifR.avg_verification_days;

      payload.reports_stats = {
        total,
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
        avg_verification_days,
      };
    }

    if (role === "ADMIN") {
      const counts = await env.D1.prepare(
        `SELECT COUNT(*) AS reports,
          SUM(CASE WHEN r.merged_into IS NULL THEN 1 ELSE 0 END) AS cases,
          SUM(CASE WHEN r.merged_into IS NULL AND r.status IN ('resolved','closed')
            AND EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id
              AND h.status = 'resolved' AND date(h.occurred_at) = date('now'))
            THEN 1 ELSE 0 END) AS resolved_today
         FROM reports r`,
      ).first<{
        reports: number;
        cases: number | null;
        resolved_today: number | null;
      }>();
      payload.total = Number(counts?.reports ?? 0);
      payload.total_cases = Number(counts?.cases ?? 0);
      payload.totals = { reports: payload.total, cases: payload.total_cases };
      payload.resolved_today = Number(counts?.resolved_today ?? 0);
    }

    return c.json(payload);
  }),
);
