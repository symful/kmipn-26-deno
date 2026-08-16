import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const sharedFilterRoute = new Hono<{ Bindings: Env }>();

sharedFilterRoute.get("/", safeHandler(async (c) => {
  const token = c.req.param("token");

  const result = await withClient(c.env, async (client) => {
    const r = await client.query(
      `SELECT filter_data, expires_at FROM shared_filters
       WHERE share_token = $1 AND expires_at > NOW()`,
      [token]
    );
    return r.rows[0];
  });

  if (!result) {
    return c.json({ error: { code: "NOT_FOUND", message: "Filter not found or expired" } }, 404);
  }

  return c.json({ filter_data: result.filter_data, expires_at: result.expires_at });
}));
