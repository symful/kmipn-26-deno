import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const reportsNearbyRoute = new Hono<{ Bindings: Env }>();

reportsNearbyRoute.get("/", requireAuth, safeHandler(async (c) => {
  const lat = parseFloat(c.req.query("lat") ?? "");
  const lng = parseFloat(c.req.query("lng") ?? "");
  const radius = parseFloat(c.req.query("radius") ?? "1000");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid lat/lng parameters" } }, 400);
  }
  if (isNaN(radius) || radius <= 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid radius parameter" } }, 400);
  }

  const reports = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT r.id, r.category_id, c.name as category_name, r.status,
              ST_Distance(r.location, ST_MakePoint($1, $2)::geography) AS distance_m,
              r.lat, r.lng, r.photo_urls
       FROM reports r
       JOIN categories c ON c.id = r.category_id
       WHERE ST_DWithin(r.location::geography, ST_MakePoint($1, $2)::geography, $3)
       ORDER BY distance_m ASC
       LIMIT $4`,
      [lng, lat, radius, limit]
    );
    return r.rows.map((row) => ({
      id: row.id,
      category_id: row.category_id,
      category_name: row.category_name,
      status: row.status,
      distance_m: Number(row.distance_m),
      lat: row.lat,
      lng: row.lng,
      photo_url: row.photo_urls?.[0] ?? null,
    }));
  });

  return c.json({ reports });
}));
