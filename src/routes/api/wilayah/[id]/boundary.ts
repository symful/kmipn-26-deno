import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const wilayahBoundaryRoute = new Hono<{ Bindings: Env }>();

wilayahBoundaryRoute.get(
  "/:id/boundary",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id || !UUID_REGEX.test(id)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid wilayah UUID is required" } }, 400);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, name, level, ST_AsGeoJSON(geom)::json AS geometry
         FROM wilayah
         WHERE id = $1 AND geom IS NOT NULL`,
        [id]
      );
      return r.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Wilayah boundary not found" } }, 404);
    }

    const feature = {
      type: "Feature" as const,
      id: result.id,
      geometry: result.geometry,
      properties: {
        id: result.id,
        name: result.name,
        level: result.level,
      },
    };

    return c.json(feature);
  }),
);
