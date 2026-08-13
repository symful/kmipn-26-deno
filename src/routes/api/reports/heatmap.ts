import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";

export const reportsHeatmapRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

reportsHeatmapRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR", "VERIFIKATOR", "PENGAMBIL_KEPUTUSAN", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const category_id = c.req.query("category_id");

    const clusters = await withClient(c.env, async (client) => {
      const params: (string | undefined)[] = [];
      const conditions: string[] = [];

      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }

      if (category_id) {
        params.push(category_id);
        conditions.push(`category_id = $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const baseSql = `SELECT
          ST_Y(ST_SnapToGrid(geom, 0.01)) AS lat,
          ST_X(ST_SnapToGrid(geom, 0.01)) AS lng,
          COUNT(*)::int AS count,
          COALESCE(AVG(severity), 0)::numeric(10,2) AS severity_avg
        FROM reports
        ${whereClause}
        GROUP BY ST_SnapToGrid(geom, 0.01)`;

      const { sql, params: finalParams } = applyWilayahFilter(
        `${baseSql} ORDER BY count DESC LIMIT 1000`,
        params,
        user.wilayah_id,
      );

      const result = await client.query(sql, finalParams);
      return result.rows.map((row) => ({
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        count: row.count,
        severity_avg: parseFloat(row.severity_avg),
      }));
    });

    return c.json({ clusters });
  }),
);
