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

    const result = await withClient(c.env, async (client: PgClient) => {
      const existing = await client.query(
        "SELECT id FROM reports WHERE idempotency_key = $1",
        [parsed.data.idempotency_key]
      );
      if (existing.rows[0]) {
        return { id: existing.rows[0].id as string, duplicate: true };
      }
      const reportedAt = parsed.data.reported_at ? new Date(parsed.data.reported_at) : new Date();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO reports (idempotency_key, category_id, description, location, photo_urls, status, created_at, updated_at, reported_at, title, wilayah_id, population_affected, vulnerability_index)
         VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $6, 'submitted', NOW(), NOW(), $7, $8,
           (SELECT w.id FROM wilayah w WHERE w.geom IS NOT NULL AND ST_Contains(w.geom, ST_MakePoint($4, $5)::geometry) ORDER BY w.level ASC LIMIT 1),
           $9, $10) RETURNING id`,
        [
          parsed.data.idempotency_key,
          parsed.data.category_id,
          parsed.data.description,
          parsed.data.lng,
          parsed.data.lat,
          parsed.data.photo_urls ?? [],
          reportedAt,
          parsed.data.title ?? null,
          parsed.data.population_affected ?? 0,
          parsed.data.vulnerability_index ?? 0.5,
        ]
      );
      return { id: inserted.rows[0]!.id, duplicate: false };
    });

    if (!result.duplicate) {
      const user = c.get("user");
      await appendAudit(c.env, {
        actor: user.sub,
        action: "report_create",
        objectType: "report",
        objectId: result.id,
        after: parsed.data,
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "report_create", err: e }));
      try {
        await withClient(c.env, async (client) => {
          await client.query(
            `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
             VALUES ($1, 'internal', $2, $3, NOW())`,
            ["report_created", JSON.stringify({ report_id: result.id, action: "report_created" }), result.id]
          );
        });
      } catch (e) {
        logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
      }
      c.executionCtx.waitUntil(
        Promise.all([
          runAssessment(c.env, result.id).catch((e) =>
            logger.error({ route: c.req.path, method: c.req.method, error: e, context: "ai_assessment_failed" })
          ),
          evaluatePriority(c.env, result.id).catch((e) =>
            logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
          ),
        ])
      );
    }

    return c.json(result, result.duplicate ? 200 : 201);
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