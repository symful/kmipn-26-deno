import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { z } from "zod";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

const PublicReportCreateSchema = z.object({
  idempotency_key: z.string().uuid(),
  category_id: z.string().uuid(),
  description: z.string().min(1).max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  device_id: z.string().min(1).max(255),
  photo_urls: z.array(z.string().url()).max(10).optional(),
  created_at: z.string().datetime().optional(),
  reported_at: z.string().datetime().optional(),
  title: z.string().max(255).optional(),
});

const PublicSyncBatchSchema = z.object({
  reports: z.array(PublicReportCreateSchema).min(1).max(50),
});

export const publicSyncBatchRoute = new Hono<{ Bindings: Env }>();

publicSyncBatchRoute.post(
  "/",
  rateLimit({ keyBy: () => "sync-batch", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = PublicSyncBatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const results = await withClient(c.env, async (client) => {
      const out: Array<{
        idempotency_key: string;
        status: "inserted" | "duplicate" | "failed";
        id?: string;
        error?: string;
      }> = [];

      for (const r of parsed.data.reports) {
        try {
          const existing = await client.query<{ id: string }>(
            "SELECT id FROM reports WHERE idempotency_key = $1",
            [r.idempotency_key],
          );
          if (existing.rows[0]) {
            out.push({
              idempotency_key: r.idempotency_key,
              id: existing.rows[0].id,
              status: "duplicate",
            });
            continue;
          }

          const reportedAt = r.reported_at ? new Date(r.reported_at) : (r.created_at ? new Date(r.created_at) : new Date());
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO reports (idempotency_key, category_id, description, location, photo_urls, status, created_at, updated_at, reported_at, title)
             VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $6, 'submitted', $7, NOW(), $8, $9) RETURNING id`,
            [
              r.idempotency_key,
              r.category_id,
              r.description,
              r.lng,
              r.lat,
              r.photo_urls ?? [],
              r.created_at ? new Date(r.created_at) : new Date(),
              reportedAt,
              r.title ?? null,
            ],
          );
          if (!inserted.rows[0]) throw new Error("Insert failed: no row returned");
          const newReportId = inserted.rows[0].id;
          out.push({
            idempotency_key: r.idempotency_key,
            id: newReportId,
            status: "inserted",
          });
          try {
            await client.query(
              `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
               VALUES ($1, 'internal', $2, $3, NOW())`,
              ["report_created", JSON.stringify({ report_id: newReportId, action: "report_created" }), newReportId]
            );
          } catch (e) {
            logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
          }
        } catch (e) {
          out.push({
            idempotency_key: r.idempotency_key,
            status: "failed",
            error: (e as Error).message,
          });
        }
      }

      return out;
    });

    return c.json({ results });
  }),
);
