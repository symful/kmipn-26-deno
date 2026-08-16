import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const reportSupportingRoute = new Hono<{ Bindings: Env }>();

reportSupportingRoute.get("/", requireAuth, safeHandler(async (c) => {
  const reportId = c.req.param("id");
  if (!reportId) {
    return c.json({ error: { code: "MISSING_REPORT_ID", message: "Report ID is required" } }, 400);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "4", 10), 1), 12);

  const supporting = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT r.id, r.photo_urls, r.created_at, r.status
       FROM reports r
       WHERE (r.facility_card_id = (SELECT facility_card_id FROM reports WHERE id = $1 AND facility_card_id IS NOT NULL)
              OR r.parent_report_id = $1)
         AND r.id != $1
         AND r.status != 'duplicate_merged'
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [reportId, limit]
    );
    return r.rows;
  });

  return c.json({ reports: supporting });
}));
