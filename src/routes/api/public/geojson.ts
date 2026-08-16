import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";
import { redactText } from "@/lib/agent/redaction";

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
    const bboxParam = c.req.query("bbox");
    const monthParam = c.req.query("month");

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

      // bbox filter: minLng,minLat,maxLng,maxLat
      if (bboxParam) {
        const coords = bboxParam.split(",").map((c) => parseFloat(c.trim()));
        if (coords.length === 4 && coords.every((v) => !isNaN(v))) {
          filters.push(`ST_Contains(ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326), r.geom::geometry)`);
          params.push(coords[0], coords[1], coords[2], coords[3]);
        }
      }

      // month filter: YYYY-MM
      if (monthParam) {
        const monthRegex = /^\d{4}-\d{2}$/;
        if (monthRegex.test(monthParam)) {
          filters.push(`date_trunc('month', r.reported_at) = date_trunc('month', $${i++}::date)`);
          params.push(monthParam);
        }
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

        const description = redactText(String(row.description ?? "")).slice(0, 100);

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

/**
 * Deterministic coordinate generalization for privacy fuzzing.
 * Same lat/lng always produces same generalized coords (no jitter).
 * Uses a hash-based grid snap to ~100m precision cells.
 */
function generalizeLocation(
  lat: number,
  lng: number
): { lat: number; lng: number } {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { lat: 0, lng: 0 };
  }

  const maxOffsetKm = 5;

  // Deterministic hash from rounded coordinates (~100m precision)
  // Using a prime multiplier for better distribution
  const hashInput = Math.floor(lat * 1000) * 1000 + Math.floor(lng * 1000);
  const hash = ((hashInput * 1000003) ^ (hashInput >> 13)) % 100;

  // Use hash to determine consistent offset direction and magnitude
  // hash 0-49: negative offset, hash 50-99: positive offset
  const direction = hash < 50 ? -1 : 1;
  // Scale magnitude to 0-1 range, avoiding extremes (0 and 1)
  const magnitude = ((hash % 50) + 1) / 51;

  const latOffset = direction * magnitude * (maxOffsetKm / 111);
  const lngOffset = direction * magnitude * (maxOffsetKm / (111 * Math.cos((lat * Math.PI) / 180)));

  return {
    lat: Math.round((lat + latOffset) * 1000000) / 1000000,
    lng: Math.round((lng + lngOffset) * 1000000) / 1000000,
  };
}
