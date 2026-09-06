import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const publicReportsClusterRoute = new Hono<{ Bindings: Env }>();

publicReportsClusterRoute.get(
  "/",
  safeHandler(async (c) => {
    const bboxParam = c.req.query("bbox");
    const monthParam = c.req.query("month");
    const zoom = parseFloat(c.req.query("zoom") ?? "10");

    const result = async () => {
      const where = `WHERE r.status NOT IN ('rejected', 'duplicate_merged')`;

      const r = await c.env.D1.prepare(
        `SELECT
        ROUND(AVG(r.lng), 4) as lng,
        ROUND(AVG(r.lat), 4) as lat,
        COUNT(*) as count,
        r.status as dominant_status,
        c.name as dominant_category,
        c.id as category_id
      FROM reports r
      LEFT JOIN categories c ON c.id = r.category_id
      ${where}
      GROUP BY r.status, c.id, c.name
      ORDER BY count DESC
      LIMIT 100`,
      ).all<{
        lng: number;
        lat: number;
        count: number;
        dominant_status: string;
        dominant_category: string;
        category_id: string;
      }>();

      return r.results ?? [];
    };

    const clusters = (await result()).map((row) => ({
      lng: row.lng ?? 0,
      lat: row.lat ?? 0,
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
    case "needs_survey":
      return "#f59e0b";
    case "resolved":
      return "#10b981";
    default:
      return "#8a9099";
  }
}
