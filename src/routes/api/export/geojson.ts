import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { applyWilayahFilter } from "@/lib/rbac";
import { redactPII } from "@/lib/csv-redaction";

export const exportGeojsonRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

exportGeojsonRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR", "PENGAMBIL_KEPUTUSAN", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const features = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (status) { filters.push(`status = $${i++}`); params.push(status); }
      if (categoryId) { filters.push(`category_id = $${i++}`); params.push(categoryId); }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const baseQuery = `SELECT id, category_id, description, lng, lat,
                status, severity, created_at, photo_urls[1] AS thumbnail
         FROM reports ${where}
         ORDER BY created_at DESC
         LIMIT 1000`;
      const wilayahScope = user.role === "ADMIN_DAERAH" ? user.wilayah_id : (user.role !== "ADMIN" ? user.wilayah_id : null);
      const { sql, params: filterParams } = applyWilayahFilter(baseQuery, params, wilayahScope, "reports");
      const r = await client.query(sql, filterParams);
      return r.rows.map((row) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [Number(row.lng), Number(row.lat)] },
        properties: {
          id: row.id,
          category_id: row.category_id,
          description: redactPII(String(row.description ?? "")).slice(0, 200),
          status: row.status,
          severity: row.severity,
          created_at: row.created_at,
          thumbnail: row.thumbnail,
        },
      }));
    });

    const action = "export_geojson";
    appendAudit(c.env, {
      actor: c.get("user").sub,
      action,
      objectType: "report_export",
      objectId: `export_${Date.now()}`,
    }).catch((e) => logger.error({ route: "/api/export/geojson", method: "GET", context: "audit_write_failed", action, error: e as Error }));

    return c.json({
      type: "FeatureCollection" as const,
      features,
    });
  }),
);