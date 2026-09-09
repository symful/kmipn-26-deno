import { enrichReportLocation } from "@/lib/geocoding";
import { recordedAddress } from "@/lib/report-area";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson } from "@/lib/validation";
import { checkRateLimit } from "@/lib/ratelimit";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { ReportCreateSchema, PhotoUrlSchema } from "@/lib/schemas";
import { evaluatePriority } from "@/lib/priority/calculator";

const AnonymousReportCreateSchema = ReportCreateSchema.omit({
  photo_urls: true,
}).extend({
  idempotency_key: z.string().min(1),
  device_id: z.string().min(1),
  description: z.string().min(10).max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  title: z.string().max(255).optional(),
  photos: z.array(PhotoUrlSchema).max(10).optional(),
  captcha_token: z.string().optional(),
  population_affected: z.number().int().min(0).optional(),
  vulnerability_index: z.number().min(0).max(1).optional(),
});

const IP_RATE_LIMIT = { limit: 5, windowMs: 60_000 };
const DEVICE_RATE_LIMIT = { limit: 20, windowSec: 3600 };

export const anonymousReportsRoute = new Hono<{ Bindings: Env }>();

anonymousReportsRoute.post(
  "/",
  async (c, next) => {
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      "anonymous";
    const allowed = await checkRateLimit(
      `anon-report:ip:${ip}`,
      IP_RATE_LIMIT.limit,
      IP_RATE_LIMIT.windowMs,
    );
    if (!allowed) {
      c.header("Retry-After", String(Math.ceil(IP_RATE_LIMIT.windowMs / 1000)));
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }
    return await next();
  },
  safeHandler(async (c) => {
    const parsed = await parseJson(c, AnonymousReportCreateSchema);

    const { device_id } = parsed;
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      "anonymous";

    const deviceAllowed = await checkRateLimit(
      `anon-report:device:${device_id}`,
      DEVICE_RATE_LIMIT.limit,
      DEVICE_RATE_LIMIT.windowSec * 1000,
    );
    if (!deviceAllowed) {
      c.header("Retry-After", String(DEVICE_RATE_LIMIT.windowSec));
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests from this device",
          },
        },
        429,
      );
    }

    if (parsed.captcha_token) {
      const captchaSecret = c.env.CAPTCHA_SECRET;
      if (captchaSecret) {
        let captchaValid = false;
        try {
          const verifyResp = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                secret: captchaSecret,
                response: parsed.captcha_token,
              }),
            },
          );
          const verifyData = (await verifyResp.json()) as { success: boolean };
          captchaValid = verifyData.success === true;
        } catch (e: unknown) {
          const err = e instanceof Error ? e : new Error(String(e));
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: err,
            context: "turnstile_verify_failed",
          });
        }
        if (!captchaValid) {
          return c.json(
            {
              error: {
                code: "CAPTCHA_FAILED",
                message: "Captcha verification failed",
              },
            },
            400,
          );
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

    const existingReport = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE idempotency_key = ?",
    )
      .bind(parsed.idempotency_key)
      .first<{ id: string }>();
    if (existingReport) {
      return c.json({ duplicate: true, id: existingReport.id as string }, 200);
    }

    const category = await c.env.D1.prepare(
      "SELECT id FROM categories WHERE id = ?",
    )
      .bind(parsed.category_id)
      .first();
    if (!category)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "category_id: Category not found",
          },
        },
        400,
      );
    if (parsed.supporting_case_id) {
      const target = await c.env.D1.prepare(
        "SELECT id FROM reports WHERE id = ? AND merged_into IS NULL AND status NOT IN ('rejected', 'out_of_scope', 'draft')",
      )
        .bind(parsed.supporting_case_id)
        .first();
      if (!target)
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "supporting_case_id: Case is unavailable",
            },
          },
          400,
        );
    }

    const inserted = await c.env.D1.prepare(
      `INSERT INTO reports (id, idempotency_key, category_id, description, lat, lng, photo_urls, status, created_at, updated_at, reporter_id, title, reported_at, population_affected, vulnerability_index, severity, device_id, kecamatan, kelurahan, kabupaten, provinsi, impact, impact_dampak, merged_into, address_area)
       VALUES (lower(hex(randomblob(6))), ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'), NULL, ?, datetime('now'), ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        parsed.idempotency_key,
        parsed.category_id,
        parsed.description,
        parsed.lat,
        parsed.lng,
        JSON.stringify(parsed.photos ?? []),
        parsed.title ?? parsed.description?.slice(0, 60) ?? null,
        parsed.population_affected ?? null,
        parsed.vulnerability_index ?? null,
        parsed.device_id ?? null,
        parsed.kecamatan ?? null,
        parsed.kelurahan ?? null,
        parsed.kabupaten ?? null,
        parsed.provinsi ?? null,
        JSON.stringify({ reported_severity: parsed.reported_severity ?? null }),
        JSON.stringify(parsed.impact_dampak ?? []),
        parsed.supporting_case_id ?? null,
        recordedAddress(parsed),
      )
      .run();

    const newReport = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE idempotency_key = ?",
    )
      .bind(parsed.idempotency_key)
      .first<{ id: string }>();

    const reportId = newReport?.id;
    if (!reportId) {
      return c.json(
        {
          error: { code: "INSERT_FAILED", message: "Failed to create report" },
        },
        500,
      );
    }

    c.executionCtx.waitUntil(
      enrichReportLocation(c.env, reportId, parsed.lat, parsed.lng, {
        kecamatan: parsed.kecamatan,
        kelurahan: parsed.kelurahan,
        kabupaten: parsed.kabupaten,
        provinsi: parsed.provinsi,
        address_area: parsed.address_area,
      }),
    );

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: "WARGA",
        actor: "anonymous",
        action: "anonymous_report_create",
        objectType: "report",
        objectId: reportId,
        before: null,
        after: {
          idempotency_key: parsed.idempotency_key,
          category_id: parsed.category_id,
          device_id,
          ip,
        },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "anonymous_report_create",
          err: e,
        }),
      ),
    );

    c.executionCtx.waitUntil(
      c.env.D1.prepare(
        `INSERT INTO report_status_history (id, report_id, status, label, actor, occurred_at)
         VALUES (lower(hex(randomblob(6))), ?, 'submitted', ?, NULL, datetime('now'))`,
      )
        .bind(reportId, "Laporan anonim dibuat")
        .run()
        .catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e,
            context: "status_history_create_failed",
            reportId,
          }),
        ),
    );

    // Assessment is started explicitly by an operator.
    c.executionCtx.waitUntil(
      evaluatePriority(c.env, reportId).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "priority_calc_failed",
          reportId,
        }),
      ),
    );

    return c.json(
      {
        id: reportId,
        idempotency_key: parsed.idempotency_key,
        duplicate: false,
        status: "submitted",
        assessment_status: "not_started",
        supporting_case_id: parsed.supporting_case_id ?? null,
      },
      201,
    );
  }),
);
