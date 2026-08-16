import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

export const publicReportsClusterRoute = new Hono<{ Bindings: Env }>();

/**
 * GET /api/public/reports/cluster - Get cluster data for public reports map
 *
 * Returns cluster pins with count, location, and dominant status/category
 * Supports bbox and month filters
 *
 * NO: reporter_id (device_id), exact location, internal assessments
 */
publicReportsClusterRoute.get("/", safeHandler(async (c) => {
  const bboxParam = c.req.query("bbox"); // format: "minLng,minLat,maxLng,maxLat"
  const monthParam = c.req.query("month"); // format: "YYYY-MM"
  const zoom = parseFloat(c.req.query("zoom") ?? "10");

  // Determine cluster radius based on zoom level
  const clusterRadius = zoom > 14 ? 0.001 : zoom > 10 ? 0.01 : 0.1;

  const result = await withClient(c.env, async (client: PgClient) => {
    const filters: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    // Default: exclude rejected and duplicate_merged reports from public view
    filters.push(`r.status NOT IN ('rejected', 'duplicate_merged')`);

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

    // Get cluster data grouped by generalized location (kabupaten centroid)
    // This provides privacy-safe clustering
    const r = await client.query(
      `SELECT 
        ROUND(ST_X(ST_Centroid(kab.geom))::numeric, 4) as lng,
        ROUND(ST_Y(ST_Centroid(kab.geom))::numeric, 4) as lat,
        COUNT(*)::int as count,
        MODE() WITHIN GROUP (ORDER BY r.status) as dominant_status,
        MODE() WITHIN GROUP (ORDER BY c.name) as dominant_category,
        c.id as category_id
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN wilayah kab ON kab.level = 'KABUPATEN'
         AND kab.geom IS NOT NULL
         AND ST_Contains(kab.geom, r.geom::geometry)
       ${where}
       GROUP BY ROUND(ST_X(ST_Centroid(kab.geom))::numeric, 4), ROUND(ST_Y(ST_Centroid(kab.geom))::numeric, 4), c.id
       ORDER BY count DESC`,
      params
    );

    return r.rows;
  });

  const clusters = result.map((row: any) => ({
    lng: row.lng ?? 0,
    lat: row.lat ?? 0,
    count: row.count,
    dominant_status: row.dominant_status,
    dominant_category: row.dominant_category,
    color: getStatusColor(row.dominant_status),
  }));

  return c.json({ clusters });
}));

function getStatusColor(status: string): string {
  switch (status) {
    case "verified": return "#0f7a6b";
    case "under_review": return "#e8bd57";
    case "in_progress": return "#3b82f6";
    case "submitted": return "#8a9099";
    case "needs_survey": return "#f59e0b";
    case "resolved": return "#10b981";
    default: return "#8a9099";
  }
}
