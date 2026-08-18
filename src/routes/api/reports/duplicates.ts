import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const reportsDuplicatesRoute = new Hono<{ Bindings: Env }>();

reportsDuplicatesRoute.get("/", requireAuth, safeHandler(async (c) => {
  const lat = c.req.query("lat");
  const lng = c.req.query("lng");
  const categoryId = c.req.query("category_id");

  if (!lat || !lng || !categoryId) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "lat, lng, and category_id are required" } }, 400);
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radius = parseFloat(c.req.query("radius") ?? "500");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "10", 10), 50);

  if (isNaN(latNum) || isNaN(lngNum)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "lat and lng must be valid numbers" } }, 400);
  }

  const candidates = await withClient(c.env, async (client) => {
    const locationPoint = `ST_SetSRID(ST_MakePoint($${1}, $${2}), 4326)::geography`;

    const spatialR = await client.query(
      `SELECT r.id as report_id,
              ST_Distance(r.location, ${locationPoint}) AS distance_m,
              r.description,
              r.status,
              r.photo_urls,
              similarity(r.description, $3) AS similarity_score
       FROM reports r
       WHERE r.category_id = $4
         AND r.location IS NOT NULL
         AND ST_DWithin(r.location, ${locationPoint}, $5)
         AND similarity(r.description, $3) > 0.1
       ORDER BY similarity_score DESC, distance_m ASC
       LIMIT $6`,
      [lngNum, latNum, "", categoryId, radius, limit]
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

  return c.json({ candidates });
}));
