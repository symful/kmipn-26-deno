import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const reportsDuplicatesRoute = new Hono<{ Bindings: Env }>();

reportsDuplicatesRoute.get("/", requireAuth, safeHandler(async (c) => {
  const reportId = c.req.query("report_id");
  if (!reportId) {
    return c.json({ error: { code: "MISSING_REPORT_ID", message: "report_id is required" } }, 400);
  }

  const radius = parseFloat(c.req.query("radius") ?? "500");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "10", 10), 50);

  const candidates = await withClient(c.env, async (client) => {
    const sourceR = await client.query(
      "SELECT id, category_id, description, lat, lng, location FROM reports WHERE id = $1",
      [reportId]
    );
    if (!sourceR.rows[0]) {
      return null;
    }
    const source = sourceR.rows[0];

    const spatialR = await client.query(
      `SELECT r.id as report_id,
              ST_Distance(r.location, $1::geography) AS distance_m,
              r.description,
              r.status,
              r.photo_urls,
              similarity(r.description, $2) AS similarity_score
       FROM reports r
       CROSS JOIN LATERAL (SELECT $1::geography AS loc) AS src
       WHERE r.id != $3
         AND r.category_id = $4
         AND ST_DWithin(r.location, $1::geography, $5)
         AND similarity(r.description, $2) > 0.1
       ORDER BY similarity_score DESC, distance_m ASC
       LIMIT $6`,
      [source.location, source.description, reportId, source.category_id, radius, limit]
    );

    return spatialR.rows.map((row) => ({
      report_id: row.report_id,
      distance_m: Number(row.distance_m),
      similarity_score: Number(row.similarity_score),
      description: row.description,
      status: row.status,
      photo_url: row.photo_urls?.[0] ?? null,
    }));
  });

  if (!candidates) {
    return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  }

  return c.json({ candidates });
}));
