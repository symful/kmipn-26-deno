import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const publicStatsTrendRoute = new Hono<{ Bindings: Env }>();

publicStatsTrendRoute.get(
  "/",
  safeHandler(async (c) => {
    const days = Math.min(
      90,
      Math.max(1, parseInt(c.req.query("days") ?? "30", 10)),
    );

    const backlogR = await c.env.D1.prepare(
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
      .bind(days - 1, days)
      .all<{
        day: string;
        laporan_count: number;
        kasus_count: number;
        completed_count: number;
      }>();

    return c.json({ buckets: backlogR.results ?? [] });
  }),
);
