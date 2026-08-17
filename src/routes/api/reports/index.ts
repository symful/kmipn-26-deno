import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { ReportCreateSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { enqueueConsentRetry } from "@/lib/audit-retry-queue";
import { runAssessment } from "@/lib/agent/orchestrator";
import { applyWilayahFilter } from "@/lib/rbac";
import { evaluatePriority } from "@/lib/priority/calculator";

export const reportsIndexRoute = new Hono<{ Bindings: Env }>();

reportsIndexRoute.post(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = ReportCreateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);

    // UU PDP consent capture
    if (parsed.data.consent === true) {
      const user = c.get("user");
      await withClient(c.env, async (client: PgClient) => {
        await client.query(
          `INSERT INTO consent_records (user_id, device_id, purpose, granted_at, ip, user_agent)
           VALUES ($1, $2, 'report_submission', NOW(), $3, $4)`,
          [user.sub, null, c.req.header("CF-Connecting-IP") ?? null, c.req.header("User-Agent") ?? null]
        );
      }).catch((e) => {
        enqueueConsentRetry(c.env, {
          user_id: user.sub,
          device_id: null,
          purpose: "report_submission",
          ip: c.req.header("CF-Connecting-IP") ?? null,
          user_agent: c.req.header("User-Agent") ?? null,
        });
        logger.error({ route: c.req.path, method: c.req.method, consent_failure: true, err: e });
      });
    }

    // Check idempotency first
    const existingReport = await withClient(c.env, async (client: PgClient) => {
      return client.query("SELECT id FROM reports WHERE idempotency_key = $1", [parsed.data.idempotency_key]);
    });
    if (existingReport.rows[0]?.id) {
      return c.json({ id: existingReport.rows[0].id as string, duplicate: true }, 200);
    }

    // Lookup wilayah - return error if outside service area
    const wilayahResult = await withClient(c.env, async (client: PgClient) => {
      return client.query<{ id: string }>(
        `SELECT w.id FROM wilayah w
         WHERE w.geom IS NOT NULL
           AND ST_Contains(w.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geometry)
         ORDER BY w.level ASC LIMIT 1`,
        [parsed.data.lng, parsed.data.lat]
      );
    });
    let wilayahId = wilayahResult.rows[0]?.id;
    if (!wilayahId) {
      return c.json(
        { error: { code: "OUTSIDE_SERVICE_AREA", message: "Report location is outside our service area. Please submit from within an active wilayah." } },
        400
      );
    }
    if (typeof wilayahId !== "string") {
      logger.error({ route: c.req.path, method: c.req.method, context: "wilayahid_invalid_type", wilayahId });
      return c.json({ error: { code: "INVALID_WILAYAH", message: "Invalid wilayah configuration" } }, 500);
    }

    // Insert report
    const reportedAt = parsed.data.reported_at ? new Date(parsed.data.reported_at) : new Date();
    const inserted = await withClient(c.env, async (client: PgClient) => {
      return client.query<{ id: string }>(
        `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at, reported_at, title, wilayah_id, population_affected, vulnerability_index)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geometry, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $5, $4, $6, 'submitted', NOW(), NOW(), $7, $8, $9, $10, $11) RETURNING id`,
        [
          parsed.data.idempotency_key,
          parsed.data.category_id,
          parsed.data.description,
          parsed.data.lng,
          parsed.data.lat,
          parsed.data.photo_urls ?? [],
          reportedAt,
          parsed.data.title ?? null,
          wilayahId,
          parsed.data.population_affected ?? 0,
          parsed.data.vulnerability_index ?? 0.5,
        ]
      );
    });
    if (!inserted || !inserted.rows || !inserted.rows[0]) {
      logger.error({ route: c.req.path, method: c.req.method, context: "insert_returned_no_rows", inserted });
      return c.json({ error: { code: "INSERT_FAILED", message: "Failed to create report" } }, 500);
    }
    const reportId = inserted.rows[0].id;
    if (!reportId) {
      logger.error({ route: c.req.path, method: c.req.method, context: "reportId_null", reportId });
      return c.json({ error: { code: "INSERT_FAILED", message: "Failed to create report - no ID returned" } }, 500);
    }

    // Post-insert: audit, outbox, async AI
    const authUser = c.get("user");
    if (!authUser) {
      logger.error({ route: c.req.path, method: c.req.method, context: "authUser_missing" });
      return c.json({ error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
    }
    if (!authUser.role || !authUser.sub) {
      logger.error({ route: c.req.path, method: c.req.method, context: "authUser_incomplete", authUser });
      return c.json({ error: { code: "UNAUTHORIZED", message: "User not authenticated" } }, 401);
    }
    await appendAudit(c.env, {
      activeRole: authUser.role,
      actor: authUser.sub,
      action: "report_create",
      objectType: "report",
      objectId: reportId,
      after: parsed.data,
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "report_create", err: e }));

    try {
      await withClient(c.env, async (client) => {
        await client.query(
           `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
            VALUES ($1, 'sipd', $2, $3, NOW())`,
          ["report_created", JSON.stringify({ report_id: reportId, action: "report_created" }), reportId]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
    }

    c.executionCtx.waitUntil(
      Promise.all([
        runAssessment(c.env, reportId).catch((e) =>
          logger.error({ route: c.req.path, method: c.req.method, error: e, context: "ai_assessment_failed" })
        ),
        evaluatePriority(c.env, reportId).catch((e) =>
          logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
        ),
      ])
    );

    return c.json({ id: reportId, duplicate: false }, 201);
  }),
);

reportsIndexRoute.get(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const creatorId = c.req.query("creator_id");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
    const offset = (page - 1) * limit;

    const rows = await withClient(c.env, async (client: PgClient) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (status) { filters.push(`status = $${i++}`); params.push(status); }
      if (categoryId) { filters.push(`category_id = $${i++}`); params.push(categoryId); }
      if (creatorId) {
        const actualCreatorId = creatorId === "me" ? user.sub : creatorId;
        filters.push(`reporter_id = $${i++}`);
        params.push(actualCreatorId);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const baseSql = `SELECT id, idempotency_key, category_id, description, lng, lat,
                photo_urls, status, severity, assigned_to, created_at, updated_at, reported_at, title
         FROM reports ${where}`;
      const countBaseParams = [...params];
      const listBaseParams = [...params, limit, offset];
      const { sql: listSql, params: listParams } = applyWilayahFilter(
        `${baseSql} ORDER BY created_at DESC LIMIT $${countBaseParams.length + 1} OFFSET $${countBaseParams.length + 2}`,
        listBaseParams,
        user.wilayah_id,
      );
      const { sql: countSql, params: countParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS total FROM reports ${where}`,
        countBaseParams,
        user.wilayah_id,
      );
      const r = await client.query(listSql, listParams);
      const countR = await client.query(countSql, countParams);
      return { reports: r.rows, total: countR.rows[0]?.total ?? 0 };
    });

    return c.json({
      items: rows.reports,
      pagination: {
        page,
        limit,
        total: rows.total,
        total_pages: Math.ceil(rows.total / limit),
      },
    });
  }),
);