import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

export const publicStatsRoute = new Hono<{ Bindings: Env }>();

publicStatsRoute.get(
  "/",
  safeHandler(async (c) => {
    const stats = await withClient(c.env, async (client: PgClient) => {
      const totalResult = await client.query(`SELECT COUNT(*) as total FROM reports`);
      const total = Number(totalResult.rows[0].total);

      const statusResult = await client.query(`
        SELECT status, COUNT(*) as count
        FROM reports
        GROUP BY status
      `);
      const by_status: Record<string, number> = {};
      for (const row of statusResult.rows) {
        by_status[row.status] = Number(row.count);
      }

      const categoryResult = await client.query(`
        SELECT category_id, COUNT(*) as count
        FROM reports
        WHERE category_id IS NOT NULL
        GROUP BY category_id
      `);
      const by_category = categoryResult.rows.map((row) => ({
        category_id: row.category_id,
        count: Number(row.count),
      }));

      const recentResult = await client.query(`
        SELECT COUNT(*) as recent
        FROM reports
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);
      const recent_reports_7d = Number(recentResult.rows[0].recent);

      const resolvedResult = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('resolved', 'closed', 'duplicate_merged')) as resolved
        FROM reports
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);
      const total7d = Number(resolvedResult.rows[0].total) || 1;
      const resolved7d = Number(resolvedResult.rows[0].resolved) || 0;
      const resolution_rate_7d = resolved7d / total7d;

      return { total, by_status, by_category, recent_reports_7d, resolution_rate_7d };
    });

    return c.json(stats);
  })
);
