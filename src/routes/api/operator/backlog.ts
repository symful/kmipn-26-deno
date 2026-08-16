import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const operatorBacklogRoute = new Hono<{ Bindings: Env }>();

operatorBacklogRoute.get("/", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const days = parseInt(c.req.query("days") ?? "30", 10);
  const user = c.get("user");
  
  let wilayahFilter = "";
  let params: unknown[] = [days];
  let i = 2;
  if (user.wilayah_id) {
    wilayahFilter = `AND wilayah_id = $${i++}`;
    params.push(user.wilayah_id);
  }

  const buckets = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT 
        d::date as day,
        COUNT(*) FILTER (WHERE created_at >= d AND created_at < d + INTERVAL '1 day') as laporan_count,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed') AND updated_at >= d AND updated_at < d + INTERVAL '1 day') as kasus_count
       FROM generate_series(NOW() - ($1 || ' days')::interval, NOW(), '1 day') d
       CROSS JOIN reports
       WHERE created_at >= d AND created_at < d + INTERVAL '1 day' ${wilayahFilter}
       GROUP BY d::date
       ORDER BY d ASC
       LIMIT 8`,
      params
    );
    return r.rows;
  });

  return c.json({ buckets });
}));
