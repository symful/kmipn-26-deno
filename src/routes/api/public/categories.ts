import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const publicCategoriesRoute = new Hono<{ Bindings: Env }>();

publicCategoriesRoute.get(
  "/",
  safeHandler(async (c) => {
    const rows = await c.env.D1.prepare(
      `SELECT id, name, slug, icon, short_code
     FROM categories
     WHERE deleted_at IS NULL
     ORDER BY CASE name WHEN 'Jalan' THEN 0 WHEN 'Jembatan' THEN 1 WHEN 'Air Bersih' THEN 2 WHEN 'Fasilitas Umum' THEN 3 WHEN 'Irigasi' THEN 4 ELSE 5 END, name`,
    ).all();
    const list = rows.results ?? [];
    return c.json({ categories: list, data: list });
  }),
);
