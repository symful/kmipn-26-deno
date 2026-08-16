import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const reportTimelineRoute = new Hono<{ Bindings: Env }>();

reportTimelineRoute.get("/", requireAuth, safeHandler(async (c) => {
  const reportId = c.req.param("id");
  if (!reportId) {
    return c.json({ error: { code: "MISSING_REPORT_ID", message: "Report ID is required" } }, 400);
  }

  const events = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT rsh.status, rsh.label, rsh.actor, u.name as actor_name, rsh.occurred_at
       FROM report_status_history rsh
       LEFT JOIN users u ON u.id = rsh.actor
       WHERE rsh.report_id = $1
       ORDER BY rsh.occurred_at ASC`,
      [reportId]
    );
    return r.rows.map((row) => ({
      status: row.status,
      label: row.label,
      actor: row.actor,
      actor_name: row.actor_name,
      occurred_at: row.occurred_at,
    }));
  });

  return c.json({ events });
}));
