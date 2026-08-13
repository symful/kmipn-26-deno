import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const facilitiesDetailRoute = new Hono<{ Bindings: Env }>();

facilitiesDetailRoute.get(
  "/:id",
  requireAuth,
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id || !UUID_REGEX.test(id)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid facility card ID UUID is required" } }, 400);
    }

    const facilityCard = await withClient(c.env, async (client) => {
      const cardR = await client.query(
        `SELECT fc.*, c.name AS category_name,
                ST_X(fc.geom::geometry) AS lng,
                ST_Y(fc.geom::geometry) AS lat
         FROM facility_cards fc
         JOIN categories c ON c.id = fc.category_id
         WHERE fc.id = $1`,
        [id]
      );

      if (!cardR.rows[0]) {
        return null;
      }

      const reportsR = await client.query(
        `SELECT r.id, r.description, r.status, r.severity, r.photo_urls,
                r.created_at, r.facility_card, r.lat, r.lng
         FROM reports r
         WHERE r.facility_card_id = $1
         ORDER BY r.created_at DESC`,
        [id]
      );

      return {
        ...cardR.rows[0],
        reports: reportsR.rows,
      };
    });

    if (!facilityCard) {
      return c.json({ error: { code: "NOT_FOUND", message: "Facility card not found" } }, 404);
    }

    return c.json(facilityCard);
  }),
);
