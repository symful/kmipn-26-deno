import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

export const publicGeojsonRoute = new Hono<{ Bindings: Env }>();

publicGeojsonRoute.get(
  "/",
  safeHandler(async (c) => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? "anonymous";
    if (!checkRateLimit(`public-geojson:${ip}`, 60, 60 * 1000)) {
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
    }
    const statusParam = c.req.query("status");
    const categoryId = c.req.query("category_id");

    const features = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (statusParam) {
        const statuses = statusParam.split(",").map((s) => s.trim());
        filters.push(`r.status = ANY($${i++})`);
        params.push(statuses);
      } else {
        filters.push(`r.status = ANY($${i++})`);
        params.push(["verified", "resolved", "closed"]);
      }

      if (categoryId) {
        filters.push(`r.category_id = $${i++}`);
        params.push(categoryId);
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const r = await client.query(
        `SELECT
          r.id, r.category_id, r.description, r.status, r.severity, r.created_at,
          COALESCE(kab.name, 'Unknown') AS general_wilayah,
          COALESCE(ST_X(ST_Centroid(kab.geom)), r.lng) AS kabupaten_lng,
          COALESCE(ST_Y(ST_Centroid(kab.geom)), r.lat) AS kabupaten_lat
         FROM reports r
         LEFT JOIN wilayah kab ON kab.level = 'KABUPATEN'
           AND kab.geom IS NOT NULL
           AND ST_Contains(kab.geom, r.geom::geometry)
         ${where}
         ORDER BY r.created_at DESC
         LIMIT 1000`,
        params
      );

      return r.rows.map((row) => {
        const generalizedLocation = generalizeLocation(
          Number(row.kabupaten_lat),
          Number(row.kabupaten_lng)
        );

        const description = String(row.description ?? "").slice(0, 100);

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [generalizedLocation.lng, generalizedLocation.lat],
          },
          properties: {
            id: row.id,
            category_id: row.category_id,
            general_wilayah: row.general_wilayah,
            description,
            status: row.status,
            created_at: row.created_at,
          },
        };
      });
    });

    return c.json({
      type: "FeatureCollection" as const,
      features,
    });
  }),
);

function generalizeLocation(
  lat: number,
  lng: number
): { lat: number; lng: number } {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { lat: 0, lng: 0 };
  }
  const maxOffsetKm = 5;
  const latOffset = (Math.random() - 0.5) * 2 * (maxOffsetKm / 111);
  const lngOffset = (Math.random() - 0.5) * 2 * (maxOffsetKm / (111 * Math.cos((lat * Math.PI) / 180)));
  return {
    lat: Math.round((lat + latOffset) * 1000000) / 1000000,
    lng: Math.round((lng + lngOffset) * 1000000) / 1000000,
  };
}
