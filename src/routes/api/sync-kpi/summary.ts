import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const syncKpiSummaryRoute = new Hono<{ Bindings: Env }>();

syncKpiSummaryRoute.get("/", safeHandler(async (c) => {
  const result = await withClient(c.env, async (client) => {
    const total = await client.query("SELECT COUNT(*)::int as cnt FROM reports");
    const synced = await client.query(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE status != 'draft'"
    );
    const pending = await client.query(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE status = 'draft'"
    );

    const totalCount = Number(total.rows[0]?.cnt ?? 0);
    const syncedCount = Number(synced.rows[0]?.cnt ?? 0);
    const pendingCount = Number(pending.rows[0]?.cnt ?? 0);

    return {
      sync_rate: totalCount > 0 ? Number((syncedCount / totalCount).toFixed(2)) : 1.0,
      synced_count: syncedCount,
      pending_count: pendingCount,
    };
  });

  return c.json(result);
}));
