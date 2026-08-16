import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { SyncBatchSchema } from "@/lib/schemas";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const syncBatchRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

syncBatchRoute.post(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = SyncBatchSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);

    const results = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const out: Array<{ idempotency_key: string; id: string; status: "created" | "duplicate" | "failed"; error?: string }> = [];
        for (const r of parsed.data.reports) {
          try {
            const existing = await client.query<{ id: string }>(
              "SELECT id FROM reports WHERE idempotency_key = $1",
              [r.idempotency_key]
            );
            if (existing.rows[0]) {
              out.push({ idempotency_key: r.idempotency_key, id: existing.rows[0].id, status: "duplicate" });
              continue;
            }
            const reportedAt = r.reported_at ? new Date(r.reported_at) : new Date();
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO reports (idempotency_key, category_id, description, geom, photo_urls, status, created_at, updated_at, reported_at, title)
               VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geometry, $6, 'submitted', NOW(), NOW(), $7, $8) RETURNING id`,
              [r.idempotency_key, r.category_id, r.description, r.lng, r.lat, r.photo_urls ?? [], reportedAt, r.title ?? null]
            );
            if (!inserted.rows[0]) throw new Error("Insert failed: no row returned");
            const newReportId = inserted.rows[0].id;
            out.push({ idempotency_key: r.idempotency_key, id: newReportId, status: "created" });
            try {
              await client.query(
                `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
                 VALUES ($1, 'internal', $2, $3, NOW())`,
                ["report_created", JSON.stringify({ report_id: newReportId, action: "report_created", idempotency_key: r.idempotency_key }), newReportId]
              );
            } catch (e) {
              logger.error({ route: c.req.path, method: c.req.method, report_id: newReportId, idempotency_key: r.idempotency_key, error: e as Error, context: "outbox_insert_failed" });
            }
          } catch (e) {
            logger.error({ route: c.req.path, method: c.req.method, report_id: r.idempotency_key, idempotency_key: r.idempotency_key, error: e as Error, context: "sync_batch_insert_failed" });
            out.push({ idempotency_key: r.idempotency_key, id: "", status: "failed", error: (e as Error).message });
          }
        }
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    const user = c.get("user");
    for (const entry of results) {
      if (entry.status === "created") {
        try {
          await appendAudit(c.env, {
            actor: user.sub,
            action: "report_synced",
            objectType: "report",
            objectId: entry.id,
            after: { idempotency_key: entry.idempotency_key },
          });
        } catch (e) {
          logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "audit_write_failed" });
        }
      }
    }

    return c.json({ results });
  }),
);