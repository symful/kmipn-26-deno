import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const publicCasesRoute = new Hono<{ Bindings: Env }>();

publicCasesRoute.get(
  "/",
  safeHandler(async (c) => {
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const reports = await withClient(c.env, async (client) => {
      const r = await client.query(
        `SELECT r.id, r.status, r.description, r.lat, r.lng, r.created_at,
                c.name as category_name, w.name as wilayah_name
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         LEFT JOIN wilayah w ON w.id = r.wilayah_id
         WHERE r.status NOT IN ('draft', 'archived')
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return r.rows;
    });

    return c.json({ reports, limit, offset });
  }),
);
