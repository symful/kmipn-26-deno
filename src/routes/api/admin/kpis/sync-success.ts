import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const kpiSyncSuccessRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

kpiSyncSuccessRoute.get("/", requireAuth, requireRole("ADMIN", "ADMIN_DAERAH"), safeHandler(async (c) => {
  const result = await withClient(c.env, async (client) => {
    const r = await client.query(`
      SELECT
        COALESCE(SUM(accepted_count), 0)::int AS accepted,
        COALESCE(SUM(rejected_count), 0)::int AS rejected,
        COUNT(*)::int AS batches
      FROM sync_outcomes
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    return r.rows[0];
  });
  const total = (result?.accepted ?? 0) + (result?.rejected ?? 0);
  const rate = total > 0 ? (result.accepted / total) * 100 : 0;
  return c.json({
    success_rate: Math.round(rate * 100) / 100,
    accepted: result?.accepted ?? 0,
    rejected: result?.rejected ?? 0,
    batches: result?.batches ?? 0,
    period: "30d",
  });
}));
