import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { ReportsHeatmapQuerySchema } from "@/lib/schemas";

export const reportsHeatmapRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

reportsHeatmapRoute.get(
  "/",
  safeHandler(async (c) => {
    const { status, category_id } = parseQuery(c, ReportsHeatmapQuerySchema);

    const clusters = async () => {
      const filters: string[] = [];
      const params: (string | undefined)[] = [];

      if (status) {
        filters.push(`status = ?`);
        params.push(status);
      }

      if (category_id) {
        filters.push(`category_id = ?`);
        params.push(category_id);
      }

      const whereClause =
        filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

      const baseSql = `SELECT
          ROUND(lat, 2) AS lat,
          ROUND(lng, 2) AS lng,
          COUNT(*) AS count,
          COALESCE(AVG(severity), 0) AS severity_avg
        FROM reports
        ${whereClause}
        GROUP BY ROUND(lat, 2), ROUND(lng, 2)
        ORDER BY count DESC
        LIMIT 1000`;

      const result = await c.env.D1.prepare(baseSql)
        .bind(...params)
        .all<{ lat: number; lng: number; count: number }>();
      return (
        result.results?.map((row) => ({
          lat: parseFloat(String(row.lat)),
          lng: parseFloat(String(row.lng)),
          intensity: row.count,
        })) ?? []
      );
    };

    return c.json({ points: await clusters() });
  }),
);
