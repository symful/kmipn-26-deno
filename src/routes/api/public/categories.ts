import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const publicCategoriesRoute = new Hono<{ Bindings: Env }>();

publicCategoriesRoute.get("/", safeHandler(async (c) => {
  const categories = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT id, name, slug, icon, short_code, parent_id
       FROM categories
       ORDER BY name`
    );
    return r.rows;
  });

  return c.json({ categories });
}));
