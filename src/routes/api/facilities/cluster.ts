import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const facilitiesClusterRoute = new Hono<{ Bindings: Env }>();

facilitiesClusterRoute.get("/", safeHandler(async (c) => {
  const bbox = c.req.query("bbox"); // format: "minLng,minLat,maxLng,maxLat"
  const zoom = parseFloat(c.req.query("zoom") ?? "10");

  // Determine cluster radius based on zoom
  const clusterRadius = zoom > 14 ? 0.001 : zoom > 10 ? 0.01 : 0.1;

  const reports = await withClient(c.env, async (client) => {
    let whereClause = "WHERE status NOT IN ('rejected', 'duplicate_merged')";
    const params: unknown[] = [clusterRadius];
    
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      whereClause += ` AND ST_Within(location::geometry, ST_MakeEnvelope($2, $3, $4, $5, 4326))`;
      params.push(minLng, minLat, maxLng, maxLat);
    }

    const r = await client.query(
      `SELECT 
        ROUND(ST_X(location::geometry)::numeric, 4) as lng,
        ROUND(ST_Y(location::geometry)::numeric, 4) as lat,
        COUNT(*)::int as count,
        MODE() WITHIN GROUP (ORDER BY status) as dominant_status,
        MODE() WITHIN GROUP (ORDER BY c.name) as dominant_category,
        c.id as category_id
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       ${whereClause}
       GROUP BY ROUND(ST_X(location::geometry)::numeric, 4), ROUND(ST_Y(location::geometry)::numeric, 4), c.id
       ORDER BY count DESC`,
      params
    );
    return r.rows;
  });

  const clusters = reports.map((row: any) => ({
    lng: row.lng,
    lat: row.lat,
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
    default: return "#8a9099";
  }
}
