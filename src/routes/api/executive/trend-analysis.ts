import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const executiveTrendAnalysisRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

executiveTrendAnalysisRoute.get(
  "/",
  requireAuth,
  requireRole("PENGAMBIL_KEPUTUSAN", "ADMIN"),
  safeHandler(async (c) => {
    const period = c.req.query("period") ?? "monthly";
    const stats = await withClient(c.env, async (client) => {
      let dateTrunc: string;
      let intervalCondition: string;

      switch (period) {
        case "weekly":
          dateTrunc = "week";
          intervalCondition = "12 weeks";
          break;
        case "daily":
          dateTrunc = "day";
          intervalCondition = "30 days";
          break;
        default:
          dateTrunc = "month";
          intervalCondition = "12 months";
      }

      const submissionsTrendR = await client.query(
        `SELECT
           DATE_TRUNC('${dateTrunc}', created_at) AS period,
           COUNT(*)::int AS total_submissions,
           COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS resolved,
           COUNT(*) FILTER (WHERE status IN ('verified', 'assigned', 'in_progress'))::int AS active,
           AVG(severity) FILTER (WHERE severity IS NOT NULL)::numeric(10,2) AS avg_severity
         FROM reports
         WHERE created_at > NOW() - INTERVAL '${intervalCondition}'
         GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
         ORDER BY period ASC`
      );

      const categoryTrendR = await client.query(
        `SELECT
           DATE_TRUNC('${dateTrunc}', r.created_at) AS period,
           c.slug AS category_slug,
           c.name AS category_name,
           COUNT(*)::int AS count
         FROM reports r
         JOIN categories c ON c.id = r.category_id
         WHERE r.created_at > NOW() - INTERVAL '${intervalCondition}'
         GROUP BY DATE_TRUNC('${dateTrunc}', r.created_at), c.slug, c.name
         ORDER BY period ASC, count DESC`
      );

      const wilayahTrendR = await client.query(
        `SELECT
           DATE_TRUNC('${dateTrunc}', r.created_at) AS period,
           w.name AS wilayah_name,
           COUNT(*)::int AS count
         FROM reports r
         JOIN wilayah w ON w.id = r.wilayah_id
         WHERE r.created_at > NOW() - INTERVAL '${intervalCondition}'
         GROUP BY DATE_TRUNC('${dateTrunc}', r.created_at), w.name
         ORDER BY period ASC, count DESC`
      );

      const avgResolutionTrendR = await client.query(
        `SELECT
           DATE_TRUNC('${dateTrunc}', resolved_at) AS period,
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,2) AS avg_resolution_days
         FROM reports
         WHERE resolved_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '${intervalCondition}'
         GROUP BY DATE_TRUNC('${dateTrunc}', resolved_at)
         ORDER BY period ASC`
      );

      const avgVerificationTrendR = await client.query(
        `SELECT
           DATE_TRUNC('${dateTrunc}', verified_at) AS period,
           AVG(EXTRACT(EPOCH FROM (verified_at - created_at))/86400)::numeric(10,2) AS avg_verification_days
         FROM reports
         WHERE verified_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '${intervalCondition}'
         GROUP BY DATE_TRUNC('${dateTrunc}', verified_at)
         ORDER BY period ASC`
      );

      const slaBreachTrendR = await client.query(
        `SELECT
           DATE_TRUNC('${dateTrunc}', created_at) AS period,
           COUNT(*)::int AS breached_count
         FROM reports
         WHERE created_at < NOW() - INTERVAL '14 days'
           AND created_at > NOW() - INTERVAL '${intervalCondition}'
           AND status IN ('verified', 'assigned', 'in_progress')
         GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
         ORDER BY period ASC`
      );

      return {
        submissions: submissionsTrendR.rows.map((row) => ({
          period: row.period,
          total_submissions: row.total_submissions,
          resolved: row.resolved,
          active: row.active,
          avg_severity: row.avg_severity,
        })),
        by_category: categoryTrendR.rows.map((row) => ({
          period: row.period,
          category_slug: row.category_slug,
          category_name: row.category_name,
          count: row.count,
        })),
        by_wilayah: wilayahTrendR.rows.map((row) => ({
          period: row.period,
          wilayah_name: row.wilayah_name,
          count: row.count,
        })),
        avg_resolution_days: avgResolutionTrendR.rows.map((row) => ({
          period: row.period,
          avg_resolution_days: row.avg_resolution_days,
        })),
        avg_verification_days: avgVerificationTrendR.rows.map((row) => ({
          period: row.period,
          avg_verification_days: row.avg_verification_days,
        })),
        sla_breaches: slaBreachTrendR.rows.map((row) => ({
          period: row.period,
          breached_count: row.breached_count,
        })),
      };
    });

    return c.json({ period, ...stats });
  }),
);
