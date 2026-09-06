import { recordedAddress, REPORT_AREA_SQL } from "@/lib/report-area";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { ReportCreateSchema, ReportsListQuerySchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson, parseQuery } from "@/lib/validation";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";
import { normalizeReportsPhotoUrls } from "@/lib/photo-urls";

export const reportsIndexRoute = new Hono<{ Bindings: Env }>();

reportsIndexRoute.post(
  "/",
  safeHandler(async (c) => {
    const parsed = await parseJson(c, ReportCreateSchema);

    // UU PDP consent capture
    if (parsed.consent === true) {
      const user = c.get("user");
      c.env.D1.prepare(
        `INSERT INTO consent_records (id, user_id, device_id, purpose, granted_at, ip, user_agent)
         VALUES (lower(hex(randomblob(16))), ?, ?, 'report_submission', datetime('now'), ?, ?)`,
      )
        .bind(
          user.sub,
          null,
          c.req.header("CF-Connecting-IP") ?? null,
          c.req.header("User-Agent") ?? null,
        )
        .run()
        .catch((e) => {
          logger.error({
            route: c.req.path,
            method: c.req.method,
            consent_failure: true,
            err: e,
          });
        });
    }

    // Get authenticated user (needed for INSERT reporter_id)
    const authUser = c.get("user");
    if (!authUser) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "authUser_missing",
      });
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
        401,
      );
    }
    if (!authUser.role || !authUser.sub) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "authUser_incomplete",
        authUser,
      });
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
        401,
      );
    }

    // Check idempotency first
    const existingReport = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE idempotency_key = ?",
    )
      .bind(parsed.idempotency_key)
      .first<{ id: string }>();
    if (existingReport?.id) {
      return c.json({ id: existingReport.id as string, duplicate: true }, 200);
    }

    // Validate category exists
    const catRow = await c.env.D1.prepare(
      `SELECT id FROM categories WHERE id = ?`,
    )
      .bind(parsed.category_id)
      .first();
    if (!catRow) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              "category_id: Category not found. Refresh the category list and select a category.",
          },
          details: {
            fieldErrors: {
              category_id: ["Category not found"],
            },
          },
        },
        400,
      );
    }

    const reportedAt = parsed.reported_at
      ? new Date(parsed.reported_at)
      : new Date();
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
    const photoUrlsJson = JSON.stringify(parsed.photo_urls ?? []);
    const titleValue = parsed.title ?? parsed.description?.slice(0, 60) ?? null;
    const severityValue: number | null = null;

    await c.env.D1.prepare(
      `INSERT INTO reports (id, idempotency_key, reporter_id, category_id, description, lat, lng, photo_urls, status, created_at, updated_at, reported_at, title, population_affected, vulnerability_index, severity, local_id, device_id, impact_dampak, kecamatan, kelurahan, kabupaten, provinsi, impact, merged_into, address_area)
       VALUES (lower(hex(randomblob(6))), ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        parsed.idempotency_key,
        authUser.sub,
        parsed.category_id,
        parsed.description,
        parsed.lat,
        parsed.lng,
        photoUrlsJson,
        reportedAt.toISOString(),
        titleValue,
        parsed.population_affected ?? null,
        parsed.vulnerability_index ?? null,
        severityValue,
        parsed.local_id ?? null,
        parsed.device_id ?? null,
        parsed.impact_dampak ? JSON.stringify(parsed.impact_dampak) : null,
        parsed.kecamatan ?? null,
        parsed.kelurahan ?? null,
        parsed.kabupaten ?? null,
        parsed.provinsi ?? null,
        JSON.stringify({ reported_severity: parsed.reported_severity ?? null }),
        parsed.supporting_case_id ?? null,
        recordedAddress(parsed),
      )
      .run();

    const insertResult = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE idempotency_key = ?",
    )
      .bind(parsed.idempotency_key)
      .first<{ id: string }>();

    if (!insertResult?.id) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "insert_returned_no_rows",
      });
      return c.json(
        {
          error: { code: "INSERT_FAILED", message: "Failed to create report" },
        },
        500,
      );
    }
    const reportId = insertResult.id;

    // Post-insert: audit, async AI
    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: authUser.role,
        actor: authUser.sub,
        action: "report_create",
        objectType: "report",
        objectId: reportId,
        after: parsed,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "report_create",
          err: e,
        }),
      ),
    );

    c.executionCtx.waitUntil(
      c.env.D1.prepare(
        `INSERT INTO report_status_history (id, report_id, status, label, actor, occurred_at)
         VALUES (lower(hex(randomblob(6))), ?, 'submitted', ?, ?, datetime('now'))`,
      )
        .bind(reportId, "Laporan dibuat", authUser.sub)
        .run()
        .catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e,
            context: "status_history_create_failed",
          }),
        ),
    );

    // AI is explicitly requested by an operator from the assessment button.
    c.executionCtx.waitUntil(
      evaluatePriority(c.env, reportId).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "priority_calc_failed",
        }),
      ),
    );

    return c.json(
      {
        id: reportId,
        duplicate: false,
        status: "submitted",
        assessment_status: "not_started",
        supporting_case_id: parsed.supporting_case_id ?? null,
      },
      201,
    );
  }),
);

reportsIndexRoute.get(
  "/",
  safeHandler(async (c) => {
    const {
      status,
      category_id,
      creator_id,
      page,
      limit,
      q,
      search,
      village,
      village_id,
      severity,
      period,
      month,
    } = parseQuery(c, ReportsListQuerySchema);
    const user = c.get("user");
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];
    if (user.role === "WARGA") {
      filters.push("r.reporter_id = ?");
      params.push(user.sub);
    }
    if (q || search) {
      filters.push(
        "(r.title LIKE ? OR r.description LIKE ? OR r.id LIKE ? OR r.kelurahan LIKE ?)",
      );
      params.push(...Array(4).fill(`%${q || search}%`));
    }
    if (village || village_id) {
      filters.push("r.kelurahan = ?");
      params.push(village || village_id);
    }
    if (severity) {
      const bounds: Record<string, [number, number]> = {
        ringan: [0, 39],
        low: [0, 39],
        sedang: [40, 59],
        medium: [40, 59],
        berat: [60, 79],
        high: [60, 79],
        kritis: [80, 100],
        critical: [80, 100],
      };
      const [low, high] = bounds[severity]!;
      filters.push("r.severity BETWEEN ? AND ?");
      params.push(low, high);
    }
    if (period && period !== "all") {
      filters.push("datetime(r.created_at) >= datetime('now', ?)");
      params.push(`-${parseInt(period)} days`);
    }
    if (month) {
      filters.push("strftime('%Y-%m', r.created_at) = ?");
      params.push(month);
    }
    if (status) {
      filters.push(`r.status = ?`);
      params.push(status);
    }
    if (category_id) {
      filters.push(`r.category_id = ?`);
      params.push(category_id);
    }
    if (creator_id) {
      const actualCreatorId = creator_id === "me" ? user.sub : creator_id;
      filters.push(`r.reporter_id = ?`);
      params.push(actualCreatorId);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const baseSql = `SELECT r.id, r.idempotency_key, r.category_id, r.description, r.lng, r.lat,
                r.photo_urls, r.status, r.severity, r.assigned_to, r.created_at, r.updated_at, r.reported_at, r.title, r.deadline,
                r.kecamatan, r.kelurahan, r.kabupaten, r.provinsi, r.impact, r.impact_dampak, r.merged_into,
                ${REPORT_AREA_SQL} AS address_area,
                cat.id AS cat_id, cat.name AS cat_name, cat.icon AS cat_icon,
                u.id AS assignee_id, u.name AS assignee_name,
                ps.computed_score AS priority_score,
                CASE
                  WHEN ps.computed_score IS NULL THEN 'sedang'
                  WHEN ps.computed_score < 40 THEN 'rendah'
                  WHEN ps.computed_score < 60 THEN 'sedang'
                  WHEN ps.computed_score < 80 THEN 'tinggi'
                  ELSE 'kritis'
                END AS priority_bucket
         FROM reports r
         LEFT JOIN categories cat ON cat.id = r.category_id
         LEFT JOIN users u ON u.id = r.assigned_to
         LEFT JOIN priority_scores ps ON ps.report_id = r.id
         ${where}`;
    const listParams = [...params, limit, offset];

    const listSql = `${baseSql} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) AS total FROM reports r ${where}`;

    const r = await c.env.D1.prepare(listSql)
      .bind(...listParams)
      .all<Record<string, unknown>>();
    const countR = await c.env.D1.prepare(countSql)
      .bind(...params)
      .first<{ total: number }>();
    const reports = r.results ?? [];
    const total = countR?.total ?? 0;

    const data = normalizeReportsPhotoUrls(
      reports as { photo_urls?: unknown }[],
    ).map((row: Record<string, unknown>) => ({
      id: row.id,
      idempotency_key: row.idempotency_key,
      category_id: row.category_id,
      category: row.cat_id
        ? { id: row.cat_id, name: row.cat_name, icon: row.cat_icon }
        : undefined,
      description: row.description,
      address_area: row.address_area,
      lng: row.lng,
      lat: row.lat,
      photo_urls: row.photo_urls,
      status: row.status,
      severity: row.severity,
      priority_score: row.priority_score,
      priority_bucket: row.priority_bucket,
      assigned_to: row.assigned_to,
      assignee: row.assignee_id
        ? { id: row.assignee_id, name: row.assignee_name }
        : undefined,
      title: row.title,
      kecamatan: row.kecamatan,
      kelurahan: row.kelurahan,
      kabupaten: row.kabupaten,
      provinsi: row.provinsi,
      reported_severity:
        JSON.parse(String(row.impact || "{}"))?.reported_severity ?? null,
      supporting_case_id: row.merged_into,
      impact_dampak: JSON.parse(String(row.impact_dampak || "[]")),
      deadline: row.deadline,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reported_at: row.reported_at,
    }));

    return c.json({
      data,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
