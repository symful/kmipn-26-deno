import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { z } from "zod";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { auditReportChange } from "@/lib/audit-helpers";
import { checkRateLimit } from "@/lib/ratelimit";


export const InboundWebhookPayloadSchema = z.object({
  source: z.string().min(1).max(255),
  external_id: z.string().min(1).max(255),
  idempotency_key: z.string().uuid(),
  category_id: z.string().uuid(),
  description: z.string().min(1).max(2000),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  photo_urls: z.array(z.string().url()).max(10).optional(),
  occurred_at: z.string().datetime().optional(),
});

export type InboundWebhookPayload = z.infer<typeof InboundWebhookPayloadSchema>;

export const inboundWebhookRoute = new Hono<{ Bindings: Env }>();

async function importHMACKey(key: string): Promise<CryptoKey> {
  const keyBuffer = new TextEncoder().encode(key);
  return await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

async function verifyWebhookSignature(
  env: Env,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const secret = env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("WEBHOOK_SECRET is not configured");
  }
  try {
    const cryptoKey = await importHMACKey(secret);
    const bodyEncoded = new TextEncoder().encode(body);
    const signatureBytes = Uint8Array.from(
      atob(signatureHeader.replace(/^sha256=/, "")),
      (c) => c.charCodeAt(0)
    );
    return await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes, bodyEncoded);
  } catch {
    return false;
  }
}

const MAX_PROCESSING_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

inboundWebhookRoute.post(
  "/",
  safeHandler(async (c) => {
    if (!c.env.WEBHOOK_SECRET) {
      throw new Error("WEBHOOK_SECRET is not configured");
    }

    const rawBody = await c.req.text();
    const signatureHeader = c.req.header("X-Webhook-Signature") ?? null;

    if (!(await verifyWebhookSignature(c.env, rawBody, signatureHeader))) {
      logger.warn({
        route: c.req.path,
        method: c.req.method,
        context: "webhook_signature_invalid",
      });
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } },
        401,
      );
    }

    const ip = c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? "anonymous";
    if (!checkRateLimit(`webhook:inbound:${ip}`, 60, 60 * 1000)) {
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
    }

    const idempotencyKey = c.req.header("Idempotency-Key") ?? null;

    let parsed: InboundWebhookPayload;
    try {
      parsed = InboundWebhookPayloadSchema.parse(JSON.parse(rawBody));
    } catch {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid webhook payload" } },
        400,
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_PROCESSING_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]!));
      }
      try {
        const result = await processWebhookWithIdempotency(c.env, parsed, idempotencyKey);
        return c.json({ id: result.id, duplicate: result.duplicate }, 200);
      } catch (err) {
        lastError = err;
        logger.warn({
          route: c.req.path,
          method: c.req.method,
          context: "webhook_processing_retry",
          attempt: attempt + 1,
          error_detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await withClient(c.env, async (client: PgClient) => {
      await client.query(
        `INSERT INTO webhook_dead_letter (idempotency_key, source, payload, error_message, retry_count, first_attempt_at, last_attempt_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          idempotencyKey,
          parsed.source,
          JSON.stringify(parsed),
          lastError instanceof Error ? lastError.message : String(lastError),
          MAX_PROCESSING_RETRIES,
        ],
      );
    });

    logger.error({
      route: c.req.path,
      method: c.req.method,
      context: "webhook_dead_lettered",
      idempotency_key: idempotencyKey,
      source: parsed.source,
      error_detail: lastError instanceof Error ? lastError.message : String(lastError),
    });

    return c.json(
      { error: { code: "PROCESSING_FAILED", message: "Webhook processing failed after retries" } },
      500,
    );
  }),
);

async function processWebhookWithIdempotency(
  env: Env,
  parsed: InboundWebhookPayload,
  idempotencyKey: string | null,
): Promise<{ id: string; duplicate: boolean }> {
  return await withClient(env, async (client: PgClient) => {
    await client.query("BEGIN");

    try {
      // Check header idempotency key inside transaction with FOR UPDATE lock
      // This prevents race conditions where two requests with the same
      // Idempotency-Key header both pass the SELECT before either inserts.
      if (idempotencyKey !== null) {
        const seenResult = await client.query(
          "SELECT key FROM webhook_idempotency WHERE key = $1 FOR UPDATE",
          [idempotencyKey],
        );
        if (seenResult.rows.length > 0) {
          await client.query("COMMIT");
          return { id: "already_processed", duplicate: true };
        }
      }

      const existing = await client.query(
        "SELECT id FROM reports WHERE idempotency_key = $1",
        [parsed.idempotency_key],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return { id: existing.rows[0].id as string, duplicate: true };
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO reports (idempotency_key, category_id, description, location, photo_urls, status, created_at, updated_at)
         VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $6, 'submitted', $7, $7) RETURNING id`,
        [
          parsed.idempotency_key,
          parsed.category_id,
          parsed.description,
          parsed.lng,
          parsed.lat,
          parsed.photo_urls ?? [],
          new Date(),
        ],
      );

      if (idempotencyKey !== null) {
        await client.query(
          "INSERT INTO webhook_idempotency (key, processed_at) VALUES ($1, NOW())",
          [idempotencyKey],
        );
      }

      await client.query("COMMIT");

      const reportId = inserted.rows[0]!.id;
      const actor = `webhook:${parsed.source}`;
      await auditReportChange(
        env,
        actor,
        reportId,
        "report_create",
        undefined,
        { external_id: parsed.external_id, source: parsed.source },
        "Inbound webhook from external system",
        "external",
      ).catch((e) => {
        logger.error({
          route: "/api/webhooks/inbound",
          method: "POST",
          error: e as Error,
          context: "audit_write_failed",
        });
      });

      logger.info({
        route: "/api/webhooks/inbound",
        method: "POST",
        context: "webhook_report_created",
        report_id: reportId,
        source: parsed.source,
        external_id: parsed.external_id,
      });

      return { id: reportId, duplicate: false };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}
