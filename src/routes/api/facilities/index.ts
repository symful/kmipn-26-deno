import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const facilitiesIndexRoute = new Hono<{ Bindings: Env }>();

facilitiesIndexRoute.get(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const categoryId = c.req.query("category_id");
    const status = c.req.query("status");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
    const offset = (page - 1) * limit;

    const rows = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (categoryId) {
        filters.push(`fc.category_id = $${i++}`);
        params.push(categoryId);
      }
      if (status) {
        filters.push(`fc.status = $${i++}`);
        params.push(status);
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const baseSql = `
        SELECT fc.id, fc.primary_report_id, fc.category_id, fc.canonical_name,
               fc.severity, fc.urgency_score, fc.status, fc.created_at, fc.updated_at,
               c.name AS category_name,
               ST_X(fc.geom::geometry) AS lng,
               ST_Y(fc.geom::geometry) AS lat,
               COUNT(r.id)::int AS report_count
        FROM facility_cards fc
        JOIN categories c ON c.id = fc.category_id
        LEFT JOIN reports r ON r.facility_card_id = fc.id
        ${where}
        GROUP BY fc.id, fc.primary_report_id, fc.category_id, fc.canonical_name,
                 fc.severity, fc.urgency_score, fc.status, fc.created_at, fc.updated_at,
                 c.name
      `;

      const listSql = `${baseSql} ORDER BY fc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      const countSql = `
        SELECT COUNT(DISTINCT fc.id)::int AS total
        FROM facility_cards fc
        ${where}
      `;

      const listParams = [...params, limit, offset];
      const countParams = [...params];

      const r = await client.query(listSql, listParams);
      const countR = await client.query(countSql, countParams);

      return {
        facility_cards: r.rows,
        total: countR.rows[0]?.total ?? 0,
      };
    });

    return c.json({ ...rows, page, limit });
  }),
);
