import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
import { createSipdAdapter } from "@/lib/outbox/adapters/sipd";
import { createSatuDataAdapter } from "@/lib/outbox/adapters/satu-data";
import { getConfig } from "@/config/env";

/**
 * Compute HMAC-SHA256 hex digest of the payload using the given secret.
 * Uses Web Crypto API (available in Cloudflare Workers).
 */
async function computeHmacHex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const hexChunks: string[] = [];
  new Uint8Array(signature).forEach((b) => hexChunks.push(b.toString(16).padStart(2, "0")));
  return hexChunks.join("");
}

const CRON_ROUTE = "/cron";
const CRON_METHOD = "SCHEDULED";

function getNextRetryAt(env: Env, retryCount: number): Date {
  const retryDelays = getConfig(env as unknown as Record<string, string | undefined>).OUTBOX_RETRY_DELAYS_MINUTES;
  const delayMinutes = retryDelays[Math.min(retryCount, retryDelays.length - 1)] ?? 720;
  const next = new Date();
  next.setMinutes(next.getMinutes() + delayMinutes);
  return next;
}

export interface OutboxProcessed {
  id: string;
  status: string;
  error?: string;
}

export async function processPendingOutbox(
  env: Env,
  actor?: string,
  limit: number = 100,
): Promise<{ processed: OutboxProcessed[] }> {
  const targetsJson = env.OUTBOUND_TARGETS ?? "{}";
  let targets: Record<string, string>;
  try {
    targets = JSON.parse(targetsJson);
  } catch (e) {
    throw new Error(`OUTBOUND_TARGETS is malformed: ${(e as Error).message}`);
  }

  const processed: OutboxProcessed[] = [];
  await withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      const r = await client.query<{ id: string; target_system: string; payload: unknown; retry_count: number; max_retries: number }>(
        "SELECT id, target_system, payload, retry_count, max_retries FROM outbox WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW()) ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED",
        [limit]
      );

      for (const row of r.rows) {
        const url = targets[row.target_system];
        if (!url) {
          await client.query(
            "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), error_message = $1 WHERE id = $2",
            ["adapter_not_configured", row.id]
          );
          processed.push({ id: row.id, status: "dead_letter", error: "adapter_not_configured" });
          if (actor) {
            appendAudit(env, {
              actor,
              action: "outbox_processed",
              objectType: "outbox",
              objectId: row.id,
              after: { status: "dead_letter", error: "adapter_not_configured" },
            }).catch((e) => {
              logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
            });
          }
          // Notify admin of misconfiguration
          try {
            await client.query(
              `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
               VALUES (NULL, $1, $2, $3, NULL)`,
              [
                "outbox_adapter_misconfigured",
                `Outbox adapter not configured: ${row.target_system}`,
                `Target system "${row.target_system}" has no URL configured in OUTBOUND_TARGETS. Outbox item ${row.id} has been moved to dead_letter.`,
              ]
            );
          } catch (e) {
            logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "notification_insert_failed", error: e as Error });
          }
          continue;
        }

        const currentRetryCount = row.retry_count ?? 0;
        const maxRetries = row.max_retries ?? 5;

        if (row.target_system === "sipd") {
          const sipdAdapter = createSipdAdapter(env);
          if (!sipdAdapter) {
            await client.query(
              "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), error_message = $1 WHERE id = $2",
              ["adapter_not_configured", row.id]
            );
            processed.push({ id: row.id, status: "dead_letter", error: "adapter_not_configured" });
            try {
              await client.query(
                `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
                 VALUES (NULL, $1, $2, $3, NULL)`,
                [
                  "outbox_adapter_misconfigured",
                  `Outbox adapter not configured: ${row.target_system}`,
                  `SIPD adapter is not configured. Outbox item ${row.id} has been moved to dead_letter.`,
                ]
              );
            } catch (e) {
              logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "notification_insert_failed", error: e as Error });
            }
            continue;
          }

          const result = await sipdAdapter.send(row.payload);

          if (result.status === "sent") {
            await client.query(
              "UPDATE outbox SET status = 'sent', last_attempt_at = NOW(), retry_count = retry_count + 1 WHERE id = $1",
              [row.id]
            );
            processed.push({ id: row.id, status: "sent" });
            if (actor) {
              appendAudit(env, {
                actor,
                action: "outbox_processed",
                objectType: "outbox",
                objectId: row.id,
                after: { status: "sent" },
              }).catch((e) => {
                logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
              });
            }
          } else {
            const nextRetryAt = getNextRetryAt(env, currentRetryCount + 1);
            if (currentRetryCount + 1 >= maxRetries) {
              await client.query(
                "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
                [result.error ?? "max_retries_exceeded", nextRetryAt.toISOString(), row.id]
              );
              processed.push({ id: row.id, status: "dead_letter", error: result.error ?? "" });
              if (actor) {
                appendAudit(env, {
                  actor,
                  action: "outbox_processed",
                  objectType: "outbox",
                  objectId: row.id,
                  after: { status: "dead_letter", error: result.error ?? "" },
                }).catch((e) => {
                  logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
                });
              }
            } else {
              await client.query(
                "UPDATE outbox SET status = 'failed', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
                [result.error ?? "retryable_error", nextRetryAt.toISOString(), row.id]
              );
              processed.push({ id: row.id, status: "failed", error: result.error ?? "" });
              if (actor) {
                appendAudit(env, {
                  actor,
                  action: "outbox_processed",
                  objectType: "outbox",
                  objectId: row.id,
                  after: { status: "failed", error: result.error ?? "" },
                }).catch((e) => {
                  logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
                });
              }
            }
          }
          continue;
        }

        if (row.target_system === "satu_data") {
          const satuDataAdapter = createSatuDataAdapter(env);
          if (!satuDataAdapter) {
            await client.query(
              "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), error_message = $1 WHERE id = $2",
              ["adapter_not_configured", row.id]
            );
            processed.push({ id: row.id, status: "dead_letter", error: "adapter_not_configured" });
            try {
              await client.query(
                `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
                 VALUES (NULL, $1, $2, $3, NULL)`,
                [
                  "outbox_adapter_misconfigured",
                  `Outbox adapter not configured: ${row.target_system}`,
                  `SatuData adapter is not configured. Outbox item ${row.id} has been moved to dead_letter.`,
                ]
              );
            } catch (e) {
              logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "notification_insert_failed", error: e as Error });
            }
            continue;
          }

          const result = await satuDataAdapter.send(row.payload);

          if (result.status === "sent") {
            await client.query(
              "UPDATE outbox SET status = 'sent', last_attempt_at = NOW(), retry_count = retry_count + 1 WHERE id = $1",
              [row.id]
            );
            processed.push({ id: row.id, status: "sent" });
            if (actor) {
              appendAudit(env, {
                actor,
                action: "outbox_processed",
                objectType: "outbox",
                objectId: row.id,
                after: { status: "sent" },
              }).catch((e) => {
                logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
              });
            }
          } else {
            const nextRetryAt = getNextRetryAt(env, currentRetryCount + 1);
            if (currentRetryCount + 1 >= maxRetries) {
              await client.query(
                "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
                [result.error ?? "max_retries_exceeded", nextRetryAt.toISOString(), row.id]
              );
              processed.push({ id: row.id, status: "dead_letter", error: result.error ?? "" });
              if (actor) {
                appendAudit(env, {
                  actor,
                  action: "outbox_processed",
                  objectType: "outbox",
                  objectId: row.id,
                  after: { status: "dead_letter", error: result.error ?? "" },
                }).catch((e) => {
                  logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
                });
              }
            } else {
              await client.query(
                "UPDATE outbox SET status = 'failed', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
                [result.error ?? "retryable_error", nextRetryAt.toISOString(), row.id]
              );
              processed.push({ id: row.id, status: "failed", error: result.error ?? "" });
              if (actor) {
                appendAudit(env, {
                  actor,
                  action: "outbox_processed",
                  objectType: "outbox",
                  objectId: row.id,
                  after: { status: "failed", error: result.error ?? "" },
                }).catch((e) => {
                  logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
                });
              }
            }
          }
          continue;
        }

        try {
          const body = JSON.stringify(row.payload);
          const headers: Record<string, string> = { "Content-Type": "application/json" };

          const hmacSecret = env.OUTBOUND_HMAC_SECRET;
          if (hmacSecret) {
            const signature = await computeHmacHex(body, hmacSecret);
            const sigHeader = env.OUTBOUND_HMAC_HEADER ?? "X-SIGAP-Signature";
            headers[sigHeader] = `sha256=${signature}`;
          } else {
            logger.warn({ route: CRON_ROUTE, method: CRON_METHOD, context: "outbound_no_hmac_configured", target: row.target_system });
          }

          const resp = await fetch(url, {
            method: "POST",
            headers,
            body,
          });

          if (resp.ok) {
            await client.query(
              "UPDATE outbox SET status = 'sent', last_attempt_at = NOW(), retry_count = retry_count + 1 WHERE id = $1",
              [row.id]
            );
            processed.push({ id: row.id, status: "sent" });
            if (actor) {
              appendAudit(env, {
                actor,
                action: "outbox_processed",
                objectType: "outbox",
                objectId: row.id,
                after: { status: "sent" },
              }).catch((e) => {
                logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
              });
            }
          } else {
            const nextRetryAt = getNextRetryAt(env, currentRetryCount + 1);
            if (currentRetryCount + 1 >= maxRetries) {
              await client.query(
                "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
                [`HTTP ${resp.status}`, nextRetryAt.toISOString(), row.id]
              );
              processed.push({ id: row.id, status: "dead_letter", error: `HTTP ${resp.status}` });
              if (actor) {
                appendAudit(env, {
                  actor,
                  action: "outbox_processed",
                  objectType: "outbox",
                  objectId: row.id,
                  after: { status: "dead_letter", error: `HTTP ${resp.status}` },
                }).catch((e) => {
                  logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
                });
              }
            } else {
              await client.query(
                "UPDATE outbox SET status = 'failed', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
                [`HTTP ${resp.status}`, nextRetryAt.toISOString(), row.id]
              );
              processed.push({ id: row.id, status: "failed", error: `HTTP ${resp.status}` });
              if (actor) {
                appendAudit(env, {
                  actor,
                  action: "outbox_processed",
                  objectType: "outbox",
                  objectId: row.id,
                  after: { status: "failed", error: `HTTP ${resp.status}` },
                }).catch((e) => {
                  logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
                });
              }
            }
          }
        } catch (e) {
          const nextRetryAt = getNextRetryAt(env, currentRetryCount + 1);
          if (currentRetryCount + 1 >= maxRetries) {
            await client.query(
              "UPDATE outbox SET status = 'dead_letter', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
              [String(e), nextRetryAt.toISOString(), row.id]
            );
            processed.push({ id: row.id, status: "dead_letter", error: String(e) });
            if (actor) {
              appendAudit(env, {
                actor,
                action: "outbox_processed",
                objectType: "outbox",
                objectId: row.id,
                after: { status: "dead_letter", error: String(e) },
              }).catch((e) => {
                logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
              });
            }
          } else {
            await client.query(
              "UPDATE outbox SET status = 'failed', last_attempt_at = NOW(), retry_count = retry_count + 1, error_message = $1, next_retry_at = $2 WHERE id = $3",
              [String(e), nextRetryAt.toISOString(), row.id]
            );
            processed.push({ id: row.id, status: "failed", error: String(e) });
            if (actor) {
              appendAudit(env, {
                actor,
                action: "outbox_processed",
                objectType: "outbox",
                objectId: row.id,
                after: { status: "failed", error: String(e) },
              }).catch((e) => {
                logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "audit_write_failed", error: e as Error });
              });
            }
          }
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ route: CRON_ROUTE, method: CRON_METHOD, context: "outbox_process_tx_error", error: err as Error });
      throw err;
    }
  });

  return { processed };
}

export const outboxProcessRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

outboxProcessRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const actor = c.get("user").sub;
    const result = await processPendingOutbox(c.env, actor, 50);
    return c.json(result);
  }),
);

export async function processStuckOutbox(env: Env): Promise<{ reset: number }> {
  let reset = 0;
  await withClient(env, async (client) => {
    const r = await client.query(
      `UPDATE outbox
       SET status = 'pending',
           error_message = NULL
       WHERE status = 'failed'
         AND next_retry_at <= NOW()
       RETURNING id`,
    );
    reset = r.rowCount ?? 0;
  });
  return { reset };
}
