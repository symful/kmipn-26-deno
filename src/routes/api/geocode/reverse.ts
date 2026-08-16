import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

export const geocodeRoute = new Hono<{ Bindings: Env }>();

geocodeRoute.get(
  "/reverse",
  safeHandler(async (c) => {
    const lat = Number(c.req.query("lat"));
    const lng = Number(c.req.query("lng"));

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return c.json({ error: { code: "INVALID_PARAMS", message: "lat and lng are required" } }, 400);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      const res = await client.query(`
        SELECT 
          w.id, w.name, w.level,
          parent.id as parent_id, parent.name as parent_name, parent.level as parent_level
        FROM wilayah w
        LEFT JOIN wilayah parent ON parent.id = w.parent_id
        WHERE ST_Contains(w.geom::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
          AND w.level IN ('DESA', 'KELURAHAN')
        LIMIT 1
      `, [lng, lat]);
      
      if (!res.rows[0]) {
        return null;
      }

      const village = { id: res.rows[0].id, name: res.rows[0].name };

      // Walk up the hierarchy
      let current = res.rows[0];
      let subdistrict = { id: "", name: "" };
      let district = { id: "", name: "" };
      let province = { id: "", name: "" };

      while (current.parent_id) {
        const parentRes = await client.query(
          `SELECT id, name, level, parent_id FROM wilayah WHERE id = $1`,
          [current.parent_id]
        );
        if (!parentRes.rows[0]) break;
        current = parentRes.rows[0];
        if (current.level === 'KECAMATAN') {
          subdistrict = { id: current.id, name: current.name };
        } else if (current.level === 'KABUPATEN' || current.level === 'KOTA') {
          district = { id: current.id, name: current.name };
        } else if (current.level === 'PROVINSI') {
          province = { id: current.id, name: current.name };
        }
      }

      return {
        address: `${village.name}, ${subdistrict.name}, ${district.name}`,
        road: null,
        village,
        subdistrict,
        district,
        province,
      };
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "No wilayah found for coordinates" } }, 404);
    }

    return c.json(result);
  })
);
