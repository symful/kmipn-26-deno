import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { TrendPeriodSchema } from "@/lib/schemas";

export const analyticsTrendRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

function getDateTruncAndInterval(period: string): {
  dateFormat: string;
  intervalCondition: string;
} {
  switch (period) {
    case "weekly":
      return { dateFormat: "%Y-%W", intervalCondition: "-84 days" };
    case "daily":
      return { dateFormat: "%Y-%m-%d", intervalCondition: "-30 days" };
    default:
      return { dateFormat: "%Y-%m", intervalCondition: "-365 days" };
  }
}

analyticsTrendRoute.get(
  "/",
  safeHandler(async (c) => {
    const { period } = parseQuery(c, TrendPeriodSchema);
    const env = c.env;
    const { dateFormat, intervalCondition } = getDateTruncAndInterval(period);

    const submissionsTrendR = await env.D1.prepare(
      `SELECT
         strftime('${dateFormat}', created_at) AS period,
         COUNT(*) AS total_submissions,
         SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN status IN ('verified', 'assigned', 'in_progress') THEN 1 ELSE 0 END) AS active,
         AVG(CASE WHEN severity IS NOT NULL THEN severity ELSE NULL END) AS avg_severity
       FROM reports
       WHERE created_at > datetime('now', '${intervalCondition}')
       GROUP BY strftime('${dateFormat}', created_at)
       ORDER BY period ASC`,
    ).all<{
      period: string;
      total_submissions: number;
      resolved: number;
      active: number;
      avg_severity: number | null;
    }>();

    const categoryTrendR = await env.D1.prepare(
      `SELECT
         strftime('${dateFormat}', r.created_at) AS period,
         c.slug AS category_slug,
         c.name AS category_name,
         COUNT(*) AS count
       FROM reports r
       JOIN categories c ON c.id = r.category_id
       WHERE r.created_at > datetime('now', '${intervalCondition}')
       GROUP BY strftime('${dateFormat}', r.created_at), c.slug, c.name
       ORDER BY period ASC, count DESC`,
    ).all<{
      period: string;
      category_slug: string;
      category_name: string;
      count: number;
    }>();

    const avgResolutionTrendR = await env.D1.prepare(
      `SELECT
         strftime('${dateFormat}', updated_at) AS period,
         AVG((julianday(updated_at) - julianday(created_at))) AS avg_resolution_days
       FROM reports
       WHERE status IN ('resolved', 'closed')
         AND created_at > datetime('now', '${intervalCondition}')
       GROUP BY strftime('${dateFormat}', updated_at)
       ORDER BY period ASC`,
    ).all<{
      period: string;
      avg_resolution_days: number | null;
    }>();

    const avgVerificationTrendR = await env.D1.prepare(
      `SELECT
         strftime('${dateFormat}', verified_at) AS period,
         AVG((julianday(verified_at) - julianday(created_at))) AS avg_verification_days
       FROM reports
       WHERE verified_at IS NOT NULL
         AND created_at > datetime('now', '${intervalCondition}')
       GROUP BY strftime('${dateFormat}', verified_at)
       ORDER BY period ASC`,
    ).all<{
      period: string;
      avg_verification_days: number | null;
    }>();

    const slaBreachTrendR = await env.D1.prepare(
      `SELECT
         strftime('${dateFormat}', created_at) AS period,
         COUNT(*) AS breached_count
       FROM reports
       WHERE created_at < datetime('now', '-14 days')
         AND created_at > datetime('now', '${intervalCondition}')
         AND status IN ('verified', 'assigned', 'in_progress')
       GROUP BY strftime('${dateFormat}', created_at)
       ORDER BY period ASC`,
    ).all<{
      period: string;
      breached_count: number;
    }>();

    return c.json({
      period,
      submissions: submissionsTrendR.results.map((row) => ({
        period: row.period,
        total_submissions: row.total_submissions,
        resolved: row.resolved,
        active: row.active,
        avg_severity: row.avg_severity,
      })),
      by_category: categoryTrendR.results.map((row) => ({
        period: row.period,
        category_slug: row.category_slug,
        category_name: row.category_name,
        count: row.count,
      })),
      avg_resolution_days: avgResolutionTrendR.results.map((row) => ({
        period: row.period,
        avg_resolution_days: row.avg_resolution_days,
      })),
      avg_verification_days: avgVerificationTrendR.results.map((row) => ({
        period: row.period,
        avg_verification_days: row.avg_verification_days,
      })),
      sla_breaches: slaBreachTrendR.results.map((row) => ({
        period: row.period,
        breached_count: row.breached_count,
      })),
    });
  }),
);
