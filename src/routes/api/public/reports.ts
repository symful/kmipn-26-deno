import { enrichReportLocation } from "@/lib/geocoding";
import { recordedAddress } from "@/lib/report-area";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { PublicReportCreateSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson } from "@/lib/validation";
import { checkRateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { redactText } from "@/lib/agent/redaction";
import { generalizeLocation } from "@/lib/geo";
import { normalizePhotoUrls, normalizeReportPhotoUrls } from "@/lib/photo-urls";
import { evaluatePriority } from "@/lib/priority/calculator";

const PUBLIC_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export const publicReportsRoute = new Hono<{ Bindings: Env }>();

publicReportsRoute.get(
  "/",
  safeHandler(async (c) => {
    const statusParam = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const bboxParam = c.req.query("bbox");
    const monthParam = c.req.query("month");
    const search = c.req.query("search")?.trim();
    const village = c.req.query("village") ?? c.req.query("village_id");
    const severity = c.req.query("severity");
    const period = c.req.query("period");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)),
    );
    const offset = (page - 1) * limit;

    const result = async () => {
      const filters: string[] = [
        "r.status NOT IN ('draft', 'rejected', 'out_of_scope')",
        "r.merged_into IS NULL",
      ];
      const params: unknown[] = [];

      if (statusParam) {
        const statuses = statusParam.split(",").map((s) => s.trim());
        filters.push(`r.status IN (${statuses.map(() => `?`).join(", ")})`);
        params.push(...statuses);
      } else {
        filters.push(`r.status != 'rejected'`);
      }

      if (categoryId) {
        filters.push(`r.category_id = ?`);
        params.push(categoryId);
      }
      if (search) {
        filters.push(
          "(r.title LIKE ? OR r.description LIKE ? OR r.address_area LIKE ? OR r.id LIKE ?)",
        );
        params.push(...Array(4).fill(`%${search}%`));
      }
      if (village) {
        filters.push("r.kelurahan = ?");
        params.push(village);
      }
      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        filters.push("strftime('%Y-%m', r.created_at) = ?");
        params.push(monthParam);
      }
      const days = (
        { "7d": 7, "30d": 30, "90d": 90, week: 7, month: 30 } as Record<
          string,
          number
        >
      )[period ?? ""];
      if (days) {
        filters.push("r.created_at >= datetime('now', ?)");
        params.push(`-${days} days`);
      }
      if (
        severity &&
        ["ringan", "sedang", "berat", "kritis"].includes(severity)
      ) {
        filters.push("json_extract(r.impact, '$.reported_severity') = ?");
        params.push(severity);
      }
      if (bboxParam) {
        const bbox = bboxParam.split(",").map(Number);
        if (bbox.length === 4 && bbox.every(Number.isFinite)) {
          filters.push("r.lng BETWEEN ? AND ? AND r.lat BETWEEN ? AND ?");
          params.push(bbox[0], bbox[2], bbox[1], bbox[3]);
        }
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const listSql = `
        SELECT
          r.id,
          r.category_id,
          r.title, r.description, r.kecamatan, r.kelurahan, r.kabupaten, r.provinsi,
          r.severity, json_extract(r.impact, '$.reported_severity') AS reported_severity,
          r.lat,
          r.lng,
          c.id AS cat_id,
          c.short_code AS category_short_code,
          c.name AS category_name,
          c.icon AS category_icon,
          r.status,
          r.created_at as last_updated,
          r.photo_urls,
          st.progress_percent AS task_progress,
          (SELECT COUNT(*) FROM reports r2 WHERE r2.merged_into = r.id) AS supporting_count
        FROM reports r
        LEFT JOIN categories c ON c.id = r.category_id
        LEFT JOIN tasks st ON st.id = (SELECT latest.id FROM tasks latest WHERE latest.report_id = r.id ORDER BY latest.created_at DESC LIMIT 1)
        ${where}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const countSql = `SELECT COUNT(*) AS total FROM reports r ${where}`;

      const listParams = [...params, limit, offset];
      const countParams = [...params];

      const [listResult, countResult] = await Promise.all([
        c.env.D1.prepare(listSql)
          .bind(...listParams)
          .all<Record<string, unknown>>(),
        c.env.D1.prepare(countSql)
          .bind(...countParams)
          .first<{ total: number }>(),
      ]);

      const total = countResult?.total ?? 0;

      const reports = (listResult.results ?? []).map((row) => {
        const photoUrls = normalizePhotoUrls(row.photo_urls);
        const publicProgress = (row.task_progress as number | null) ?? null;

        return {
          id: row.id,
          title: redactText(
            String(row.title || row.description || "Laporan masyarakat"),
          ),
          severity: row.severity ?? null,
          reported_severity: row.reported_severity ?? null,
          village: row.kelurahan ?? null,
          report_count: 1 + Number(row.supporting_count ?? 0),
          generalized_location:
            typeof row.lat === "number" && typeof row.lng === "number"
              ? generalizeLocation(row.lat, row.lng)
              : null,
          wilayah: {
            kecamatan: row.kecamatan ?? null,
            desa: row.kelurahan ?? null,
          },
          general_wilayah: [row.kelurahan, row.kecamatan]
            .filter(Boolean)
            .join(" · "),
          category: {
            id: row.cat_id,
            short_code: row.category_short_code ?? null,
            name: row.category_name ?? null,
            icon: row.category_icon ?? null,
          },
          status: row.status,
          kecamatan: row.kecamatan ?? null,
          kelurahan: row.kelurahan ?? null,
          kabupaten: row.kabupaten ?? null,
          provinsi: row.provinsi ?? null,
          last_updated: row.last_updated,
          public_progress: publicProgress,
          moderated_photo_url: photoUrls?.[0] ?? null,
          supporting_count: row.supporting_count ?? 0,
        };
      });

      return {
        data: reports,
        pagination: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
        },
      };
    };

    return c.json(await result());
  }),
);

publicReportsRoute.get(
  "/:id",
  safeHandler(async (c) => {
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("cf-connecting-ip") ??
      "anonymous";
    if (
      !(await checkRateLimit(
        `public-reports:${ip}`,
        PUBLIC_RATE_LIMIT.limit,
        PUBLIC_RATE_LIMIT.windowMs,
      ))
    ) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }
    const id = c.req.param("id");
    const result = await c.env.D1.prepare(
      `SELECT r.id, r.category_id, r.status, r.created_at, r.updated_at, r.photo_urls, r.title, r.description, r.severity, r.lat, r.lng FROM reports r WHERE r.id = ? AND r.merged_into IS NULL AND r.status NOT IN ('draft','rejected','out_of_scope')`,
    )
      .bind(id)
      .first<Record<string, unknown>>();

    if (!result) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    const photoUrls = normalizePhotoUrls(result.photo_urls);
    const taskRow = await c.env.D1.prepare(
      `SELECT progress_percent FROM tasks WHERE report_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(id)
      .first<{ progress_percent: number | null }>();
    const publicProgress = taskRow?.progress_percent ?? null;
    const generalizedLocation = generalizeLocation(
      result.lat == null ? NaN : Number(result.lat),
      result.lng == null ? NaN : Number(result.lng),
    );
    const generalizedLocationStr = generalizedLocation
      ? `${generalizedLocation.lat},${generalizedLocation.lng}`
      : null;

    if (result.title == null)
      throw new Error(`Data corruption: report ${id} has null title`);
    if (result.description == null)
      throw new Error(`Data corruption: report ${id} has null description`);

    return c.json({
      id: result.id,
      category_id: result.category_id,
      status: result.status,
      created_at: result.created_at,
      last_updated: result.updated_at ?? result.created_at,
      public_progress: publicProgress,
      moderated_photo_url: photoUrls?.[0] ?? null,
      title: redactText(result.title as string),
      description: redactText(result.description as string),
      severity: result.severity,
      generalized_location: generalizedLocationStr,
    });
  }),
);

publicReportsRoute.post(
  "/",
  safeHandler(async (c) => {
    const parsed = await parseJson(c, PublicReportCreateSchema);

    const rateLimitKey = `deviceId:reportCreate:${parsed.device_id}`;
    if (!(await checkRateLimit(rateLimitKey, 10, 60 * 60 * 1000))) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }

    const result = async () => {
      const existing = await c.env.D1.prepare(
        "SELECT id FROM reports WHERE idempotency_key = ?",
      )
        .bind(parsed.idempotency_key)
        .first<{ id: string }>();
      if (existing) {
        return { id: existing.id, duplicate: true };
      }

      const titleValue = parsed.title ?? parsed.description.slice(0, 60);
      const category = await c.env.D1.prepare(
        "SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL",
      )
        .bind(parsed.category_id)
        .first();
      if (!category) return { id: null, duplicate: false, error: true };
      if (parsed.supporting_case_id) {
        const target = await c.env.D1.prepare(
          "SELECT id FROM reports WHERE id = ? AND merged_into IS NULL AND status NOT IN ('rejected','out_of_scope','draft')",
        )
          .bind(parsed.supporting_case_id)
          .first();
        if (!target) return { id: null, duplicate: false, error: true };
      }
      const reportedAt = parsed.reported_at ?? new Date().toISOString();
      const inserted = await c.env.D1.prepare(
        `INSERT INTO reports (id, idempotency_key, category_id, description, lat, lng, photo_urls, status, created_at, updated_at, title, severity, device_id, reported_at, population_affected, vulnerability_index, kecamatan, kelurahan, kabupaten, provinsi, impact, impact_dampak, merged_into, address_area)
         VALUES (lower(hex(randomblob(6))), ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'), ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          parsed.idempotency_key,
          parsed.category_id,
          parsed.description,
          parsed.lat,
          parsed.lng,
          JSON.stringify(parsed.photo_urls ?? []),
          titleValue,
          parsed.device_id,
          reportedAt,
          parsed.population_affected ?? null,
          parsed.vulnerability_index ?? null,
          parsed.kecamatan ?? null,
          parsed.kelurahan ?? null,
          parsed.kabupaten ?? null,
          parsed.provinsi ?? null,
          JSON.stringify({
            reported_severity: parsed.reported_severity ?? null,
          }),
          JSON.stringify(parsed.impact_dampak ?? []),
          parsed.supporting_case_id ?? null,
          recordedAddress(parsed),
        )
        .run();

      if (!inserted.success) {
        return { id: null, duplicate: false, error: true };
      }

      const newReport = await c.env.D1.prepare(
        "SELECT id FROM reports WHERE idempotency_key = ?",
      )
        .bind(parsed.idempotency_key)
        .first<{ id: string }>();

      if (newReport?.id) {
        c.executionCtx.waitUntil(
          enrichReportLocation(c.env, newReport.id, parsed.lat, parsed.lng, {
            kecamatan: parsed.kecamatan,
            kelurahan: parsed.kelurahan,
            kabupaten: parsed.kabupaten,
            provinsi: parsed.provinsi,
            address_area: parsed.address_area,
          }),
        );
      }

      return { id: newReport?.id ?? null, duplicate: false };
    };

    const reportResult = await result();

    if (!reportResult.duplicate && reportResult.id) {
      c.executionCtx.waitUntil(
        evaluatePriority(c.env, reportResult.id).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e,
            context: "priority_calc_failed",
            reportId: reportResult.id,
          }),
        ),
      );
    }

    if (!reportResult.id)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Unable to create report. Check the selected category.",
          },
        },
        400,
      );
    return c.json(
      {
        ...reportResult,
        status: "submitted",
        assessment_status: "not_started",
      },
      reportResult.duplicate ? 200 : 201,
    );
  }),
);
