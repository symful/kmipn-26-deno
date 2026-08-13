import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { SyncBatchSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";

export const reportsSyncBatchRoute = new Hono<{ Bindings: Env }>();

reportsSyncBatchRoute.post(
  "/",
  requireAuth,
  rateLimit({ keyBy: () => "sync-batch", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = SyncBatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const user = c.get("user");
    const results = await withClient(c.env, async (client: PgClient) => {
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

          const reportedAt = r.reported_at ? new Date(r.reported_at) : new Date();
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO reports (idempotency_key, category_id, description, location, photo_urls, status, created_at, updated_at, reported_at, title, wilayah_id, population_affected, vulnerability_index)
             VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $6, 'submitted', NOW(), NOW(), $7, $8,
               (SELECT w.id FROM wilayah w WHERE w.geom IS NOT NULL AND ST_Contains(w.geom, ST_MakePoint($4, $5)::geometry) ORDER BY w.level ASC LIMIT 1),
               $9, $10) RETURNING id`,
            [
              r.idempotency_key,
              r.category_id,
              r.description,
              r.lng,
              r.lat,
              r.photo_urls ?? [],
              reportedAt,
              r.title ?? null,
              r.population_affected ?? 0,
              r.vulnerability_index ?? 0.5,
            ],
          );
          if (!inserted.rows[0]) {
            throw new Error("Insert failed: no row returned");
          }
          const newReportId = inserted.rows[0].id;

          out.push({
            idempotency_key: r.idempotency_key,
            id: newReportId,
            status: "inserted",
          });

          appendAudit(c.env, {
            actor: user.sub,
            action: "report_create",
            objectType: "report",
            objectId: newReportId,
            after: r,
          }).catch((e) =>
            logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "report_create", err: e })
          );

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
