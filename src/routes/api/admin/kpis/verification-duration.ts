import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";

export const kpiVerificationDurationRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

kpiVerificationDurationRoute.get("/", requireAuth, requireRole("ADMIN", "ADMIN_DAERAH"), safeHandler(async (c) => {
  const user = c.get("user");
  const result = await withClient(c.env, async (client) => {
    const baseQuery = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (ce.occurred_at - r.created_at)) / 3600)::numeric(10,2) AS avg_hours
      FROM case_events ce
      JOIN reports r ON r.id = ce.report_id
      WHERE ce.event_type = 'verifikator_accept'
        AND ce.occurred_at > NOW() - INTERVAL '30 days'
    `;
    const { sql, params } = applyWilayahFilter(baseQuery, [], user.role === "ADMIN_DAERAH" ? user.wilayah_id : null, "r");
    const r = await client.query(sql, params);
    return r.rows[0];
  });
  return c.json({
    avg_verification_hours: Number(result?.avg_hours ?? 0),
    sla_target_hours: 168,
    period: "30d",
  });
}));
