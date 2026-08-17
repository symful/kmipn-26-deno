import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { redactPII } from "@/lib/csv-redaction";

export const publicReportsGeojsonRoute = new Hono<{ Bindings: Env }>();

/**
 * Coarsen coordinates to 3 decimal places (~111m precision)
 */
function coarsenCoord(value: number | null | undefined): number {
  if (value == null || isNaN(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

publicReportsGeojsonRoute.get(
  "/",
  safeHandler(async (c) => {
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
          r.lat, r.lng
         FROM reports r
         ${where}
         ORDER BY r.created_at DESC
         LIMIT 1000`,
        params
      );

      return r.rows.map((row) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [coarsenCoord(row.lng), coarsenCoord(row.lat)],
        },
        properties: {
          id: row.id,
          category_id: row.category_id,
          description: redactPII(String(row.description ?? "")),
          status: row.status,
          created_at: row.created_at,
        },
      }));
    });

    return c.json({
      type: "FeatureCollection" as const,
      features,
    });
  }),
);
