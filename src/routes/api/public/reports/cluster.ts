import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

export const publicReportsClusterRoute = new Hono<{ Bindings: Env }>();

publicReportsClusterRoute.get("/", safeHandler(async (c) => {
  const bboxParam = c.req.query("bbox");
  const monthParam = c.req.query("month");
  const zoom = parseFloat(c.req.query("zoom") ?? "10");

  const clusterRadius = zoom > 14 ? 0.001 : zoom > 10 ? 0.01 : 0.1;

  const result = await withClient(c.env, async (client: PgClient) => {
    const filters: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    filters.push(`r.status NOT IN ('rejected', 'duplicate_merged')`);

    if (bboxParam) {
      const coords = bboxParam.split(",").map((c) => parseFloat(c.trim()));
      if (coords.length === 4 && coords.every((v) => !isNaN(v))) {
        filters.push(`ST_Contains(ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326), r.geom::geometry)`);
        params.push(coords[0], coords[1], coords[2], coords[3]);
      }
    }

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
        lng, lat, count, dominant_status, dominant_category, category_id
      FROM (
        SELECT 
          ROUND(ST_X(ST_Centroid(kab.geom))::numeric, 4) as lng,
          ROUND(ST_Y(ST_Centroid(kab.geom))::numeric, 4) as lat,
          COUNT(*)::int as count,
          r.status as dominant_status,
          c.name as dominant_category,
          c.id as category_id,
          ROW_NUMBER() OVER (PARTITION BY ROUND(ST_X(ST_Centroid(kab.geom))::numeric, 4), ROUND(ST_Y(ST_Centroid(kab.geom))::numeric, 4), c.id, c.name ORDER BY COUNT(*) DESC) as rn
        FROM reports r
        LEFT JOIN categories c ON c.id = r.category_id
        LEFT JOIN wilayah kab ON kab.level = 'KABUPATEN'
          AND kab.geom IS NOT NULL
          AND ST_Contains(kab.geom, r.geom::geometry)
        ${where}
        GROUP BY 1, 2, r.status, c.id, c.name, kab.geom
      ) ranked
      WHERE rn = 1
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
