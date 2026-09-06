import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const publicCasesRoute = new Hono<{ Bindings: Env }>();

publicCasesRoute.get(
  "/",
  safeHandler(async (c) => {
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const page = Math.floor(offset / limit) + 1;

    const countRow = await c.env.D1.prepare(
      `SELECT COUNT(*) as total FROM reports r
       WHERE r.status NOT IN ('draft', 'archived')`,
    ).first<{ total: number }>();
    const total = countRow?.total ?? 0;
    const total_pages = Math.ceil(total / limit);

    const rows = await c.env.D1.prepare(
      `SELECT r.id, r.status, r.description, r.lat, r.lng, r.created_at,
              c.name as category_name
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.status NOT IN ('draft', 'archived')
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all();

    const data = (rows.results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      status: row.status,
      description: row.description,
      lng: row.lng,
      lat: row.lat,
      category_name: row.category_name,
      created_at: row.created_at,
    }));

    return c.json({
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages,
      },
    });
  }),
);
