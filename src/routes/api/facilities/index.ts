import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const facilitiesIndexRoute = new Hono<{ Bindings: Env }>();

facilitiesIndexRoute.get(
  "/",
  safeHandler(async (c) => {
    const categoryId = c.req.query("category_id");
    const status = c.req.query("status");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];

    if (categoryId) {
      filters.push(`fc.category_id = ?`);
      params.push(categoryId);
    }
    if (status) {
      filters.push(`fc.status = ?`);
      params.push(status);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const baseSql = `
      SELECT fc.id, fc.primary_report_id, fc.category_id,
             NULL AS canonical_name,
             NULL AS severity,
             NULL AS urgency_score,
             fc.status, fc.created_at, fc.updated_at,
             c.name AS category_name,
             COALESCE(json_extract(fc.location, '$.lng'), 0) AS lng,
             COALESCE(json_extract(fc.location, '$.lat'), 0) AS lat,
             COUNT(r.id) AS report_count
      FROM facility_cards fc
      JOIN categories c ON c.id = fc.category_id
      LEFT JOIN reports r ON r.facility_card_id = fc.id
      ${where}
      GROUP BY fc.id, fc.primary_report_id, fc.category_id,
               fc.status, fc.created_at, fc.updated_at,
               c.name
    `;

    const listParams = [...params, limit, offset];
    const listSql = `${baseSql} ORDER BY fc.created_at DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(DISTINCT fc.id) AS total FROM facility_cards fc ${where}`;

    const [listR, countR] = await Promise.all([
      c.env.D1.prepare(listSql)
        .bind(...listParams)
        .all(),
      c.env.D1.prepare(countSql)
        .bind(...params)
        .first(),
    ]);

    return c.json({
      data: listR.results ?? [],
      pagination: {
        total: countR?.total ?? 0,
        page,
        limit,
      },
    });
  }),
);
