import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const facilitiesClusterRoute = new Hono<{ Bindings: Env }>();

facilitiesClusterRoute.get(
  "/",
  safeHandler(async (c) => {
    const bbox = c.req.query("bbox");

    let rows: {
      results?: {
        lng: number;
        lat: number;
        count: number;
        dominant_status: string;
        dominant_category: string;
        category_id: string;
      }[];
    };
    if (bbox) {
      const coords = bbox
        .split(",")
        .map(Number)
        .filter((n): n is number => !isNaN(n));
      if (coords.length < 4) {
        rows = { results: [] };
      } else {
        const [minLng, minLat, maxLng, maxLat] = coords;
        rows = (await c.env.D1.prepare(
          `SELECT
          ROUND(lng, 4) as lng,
          ROUND(lat, 4) as lat,
          COUNT(*) as count,
          MAX(status) as dominant_status,
          MAX(c.name) as dominant_category,
          c.id as category_id
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE status NOT IN ('rejected', 'duplicate_merged')
           AND lng BETWEEN ? AND ?
           AND lat BETWEEN ? AND ?
         GROUP BY ROUND(lng, 4), ROUND(lat, 4), c.id
         ORDER BY count DESC`,
        )
          .bind(minLng, maxLng, minLat, maxLat)
          .all()) as typeof rows;
      }
    } else {
      rows = (await c.env.D1.prepare(
        `SELECT
        ROUND(lng, 4) as lng,
        ROUND(lat, 4) as lat,
        COUNT(*) as count,
        MAX(status) as dominant_status,
        MAX(c.name) as dominant_category,
        c.id as category_id
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE status NOT IN ('rejected', 'duplicate_merged')
       GROUP BY ROUND(lng, 4), ROUND(lat, 4), c.id
       ORDER BY count DESC`,
      ).all()) as typeof rows;
    }

    const reports = rows.results ?? [];
    const clusters = reports.map((row: any) => ({
      lng: row.lng,
      lat: row.lat,
      count: row.count,
      dominant_status: row.dominant_status,
      dominant_category: row.dominant_category,
      color: getStatusColor(row.dominant_status),
    }));

    return c.json({ data: clusters });
  }),
);

function getStatusColor(status: string): string {
  switch (status) {
    case "verified":
      return "#0f7a6b";
    case "under_review":
      return "#e8bd57";
    case "in_progress":
      return "#3b82f6";
    case "submitted":
      return "#8a9099";
    default:
      return "#8a9099";
  }
}
