import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { withClient, type PgClient } from "@/lib/db";

export const debugReportRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

debugReportRoute.post(
  "/",
  requireAuth,
  async (c) => {
    const body = await c.req.json();
    const debugSecret = c.req.header("X-Debug-Secret");
    if (!debugSecret || debugSecret !== "debug-secret-123") {
      return c.json({ error: "Missing or invalid X-Debug-Secret header" }, 401);
    }

    try {
      // Step 1: Check idempotency
      const existingReport = await withClient(c.env, async (client: PgClient) => {
        return client.query("SELECT id FROM reports WHERE idempotency_key = $1", [body.idempotency_key]);
      });
      if (existingReport.rows[0]) {
        return c.json({ step: "idempotency", result: "exists", id: existingReport.rows[0].id });
      }

      // Step 2: Lookup wilayah
      const wilayahResult = await withClient(c.env, async (client: PgClient) => {
        return client.query<{ id: string }>(
          `SELECT w.id FROM wilayah w
           WHERE w.geom IS NOT NULL
             AND ST_Contains(w.geom, ST_MakePoint($1, $2)::geometry)
           ORDER BY w.level ASC LIMIT 1`,
          [body.lng, body.lat]
        );
      });
      const wilayahId = wilayahResult.rows[0]?.id;
      if (!wilayahId) {
        return c.json({ step: "wilayah", result: "not_found", message: "OUTSIDE_SERVICE_AREA" }, 400);
      }

      // Step 3: Insert report
      const reportedAt = body.reported_at ? new Date(body.reported_at) : new Date();
      const inserted = await withClient(c.env, async (client: PgClient) => {
        return client.query<{ id: string }>(
          `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at, reported_at, title, wilayah_id, population_affected, vulnerability_index)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geometry, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $5, $4, $6, 'submitted', NOW(), NOW(), $7, $8, $9, $10, $11) RETURNING id`,
          [
            body.idempotency_key,
            body.category_id,
            body.description,
            body.lng,
            body.lat,
            body.photo_urls ?? [],
            reportedAt,
            body.title ?? null,
            wilayahId,
            body.population_affected ?? 0,
            body.vulnerability_index ?? 0.5,
          ]
        );
      });
      return c.json({ step: "insert", result: "success", id: inserted.rows[0]!.id });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return c.json({
        step: "error",
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      }, 500);
    }
  },
);
