import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * AnonymousReportCreateSchema — validated fields for anonymous report submission.
 * - description: 10–2000 chars (broader than PublicReportCreateSchema's 500)
 * - photos: max 3 (stricter than PublicReportCreateSchema's 10)
 * - captcha_token: validated via Turnstile if CAPTCHA_SECRET is set
 */
const AnonymousReportCreateSchema = z.object({
  idempotency_key: z.string().uuid(),
  device_id: z.string().uuid(),
  category_id: z.string().uuid(),
  description: z.string().min(10).max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  title: z.string().max(255).optional(),
  photos: z.array(z.string().url()).max(3).optional(),
  captcha_token: z.string().optional(),
});

const IP_RATE_LIMIT = { limit: 5, windowMs: 60_000 };
const DEVICE_RATE_LIMIT = { limit: 20, windowSec: 3600 };

export const anonymousReportsRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /api/public/anonymous-reports
 *
 * No auth required. Creates an anonymous report.
 *
 * Rate limits:
 *   - IP: 5 requests / 60 seconds
 *   - device_id: 20 requests / hour
 *
 * Captcha:
 *   - If CAPTCHA_SECRET env var is set, validates captcha_token via Turnstile.
 *   - Otherwise skips validation and logs a note.
 *
 * Returns:
 *   - 201: { id, idempotency_key, status: "pending" } — new report created
 *   - 200: { duplicate: true, id } — idempotency_key already exists
 *   - 400: validation error or captcha failure
 *   - 429: rate limited
 */
anonymousReportsRoute.post(
  "/",
  // IP-based rate limit
  async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "anonymous";
    const allowed = await checkRateLimit(`anon-report:ip:${ip}`, IP_RATE_LIMIT.limit, IP_RATE_LIMIT.windowMs);
    if (!allowed) {
      c.header("Retry-After", String(Math.ceil(IP_RATE_LIMIT.windowMs / 1000)));
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
    }
    return await next();
  },
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = AnonymousReportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() },
        400
      );
    }

    const { device_id } = parsed.data;
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "anonymous";

    // Device-level rate limit: 20 / hour
    const deviceAllowed = await checkRateLimit(
      `anon-report:device:${device_id}`,
      DEVICE_RATE_LIMIT.limit,
      DEVICE_RATE_LIMIT.windowSec * 1000
    );
    if (!deviceAllowed) {
      c.header("Retry-After", String(DEVICE_RATE_LIMIT.windowSec));
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests from this device" } }, 429);
    }

    // Captcha validation via Turnstile (Cloudflare)
    if (parsed.data.captcha_token) {
      const captchaSecret = c.env.CAPTCHA_SECRET;
      if (captchaSecret) {
        let captchaValid = false;
        try {
          const verifyResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: captchaSecret, response: parsed.data.captcha_token }),
          });
          const verifyData = await verifyResp.json() as { success: boolean };
          captchaValid = verifyData.success === true;
        } catch (e) {
          logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "turnstile_verify_failed" });
        }
        if (!captchaValid) {
          return c.json({ error: { code: "CAPTCHA_FAILED", message: "Captcha verification failed" } }, 400);
        }
      } else {
        logger.info({
          route: c.req.path,
          method: c.req.method,
          context: "captcha_skipped_no_secret",
          device_id,
        });
      }
    }

    const existingReport = await withClient(c.env, async (client: PgClient) => {
      return client.query("SELECT id FROM reports WHERE idempotency_key = $1", [parsed.data.idempotency_key]);
    });
    if (existingReport.rows[0]) {
      return c.json({ duplicate: true, id: existingReport.rows[0].id as string }, 200);
    }

    const wilayahResult = await withClient(c.env, async (client: PgClient) => {
      return client.query<{ id: string }>(
        `SELECT w.id FROM wilayah w
         WHERE w.geom IS NOT NULL
           AND ST_Contains(w.geom, ST_MakePoint($1, $2)::geometry)
         ORDER BY w.level ASC LIMIT 1`,
        [parsed.data.lng, parsed.data.lat]
      );
    });
    const wilayahId = wilayahResult.rows[0]?.id;
    if (!wilayahId) {
      return c.json(
        { error: { code: "OUTSIDE_SERVICE_AREA", message: "Report location is outside our service area. Please submit from within an active wilayah." } },
        400
      );
    }

    const inserted = await withClient(c.env, (client: PgClient) => {
      return client.query<{ id: string }>(
        `INSERT INTO reports
           (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status,
            created_at, updated_at, reporter_id, wilayah_id, title, reported_at, population_affected, vulnerability_index)
          VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geometry, ST_MakePoint($4, $5)::geography, $5, $4, $6, 'submitted',
                  NOW(), NOW(), NULL, $7, $8, NOW(), 0, 0.5)
          RETURNING id`,
        [
          parsed.data.idempotency_key,
          parsed.data.category_id,
          parsed.data.description,
          parsed.data.lng,
          parsed.data.lat,
          parsed.data.photos ?? [],
          wilayahId,
          parsed.data.title ?? null,
        ]
      );
    });

    const reportId = inserted.rows[0]!.id;

    await appendAudit(c.env, { activeRole: "WARGA",
      actor: "anonymous",
      action: "anonymous_report_create",
      objectType: "report",
      objectId: reportId,
      after: {
        idempotency_key: parsed.data.idempotency_key,
        category_id: parsed.data.category_id,
        device_id,
        ip,
        wilayah_id: null,
      },
    }).catch((e) =>
      logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "anonymous_report_create", err: e })
    );

    return c.json(
      { id: reportId, idempotency_key: parsed.data.idempotency_key, status: "pending" },
      201
    );
  })
);
