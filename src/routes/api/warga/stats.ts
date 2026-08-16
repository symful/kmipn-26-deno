import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const wargaStatsRoute = new Hono<{ Bindings: Env }>();

wargaStatsRoute.get("/", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");

  const stats = await withClient(c.env, async (client) => {
    // Get counts by status for this user's reports
    const r = await client.query(
      `SELECT status, COUNT(*)::int as cnt
       FROM reports
       WHERE reporter_id = $1
       GROUP BY status`,
      [user.sub]
    );
    return r.rows;
  });

  const result = {
    by_status: stats.reduce((acc: any, row: any) => {
      acc[row.status] = row.cnt;
      return acc;
    }, {}),
    total: stats.reduce((sum: number, row: any) => sum + row.cnt, 0),
  };

  return c.json(result);
}));
