import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { normalizeReportsPhotoUrls } from "@/lib/photo-urls";
import { getAggregatedAssessment } from "@/lib/agent/store";
import { getConfig } from "@/config/env";

export const casesQueueRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

const NON_TERMINAL_STATUSES = [
  "submitted",
  "under_review",
  "needs_completion",
  "needs_survey",
] as const;

casesQueueRoute.get(
  "/",
  safeHandler(async (c) => {
    const statusParam = c.req.query("status");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20),
    );
    const kategori = c.req.query("kategori");
    const assessment = c.req.query("assessment") ?? "Semua";
    const offset = (page - 1) * limit;

    const statuses: string[] = statusParam
      ? statusParam.split(",").map((s) => s.trim())
      : [...NON_TERMINAL_STATUSES];

    const conditions: string[] = [];
    const params: unknown[] = [...statuses];

    conditions.push(`r.status IN (${statuses.map(() => "?").join(", ")})`);
    const search = c.req.query("search")?.trim();
    if (search) {
      conditions.push(
        "(r.id LIKE ? OR r.title LIKE ? OR r.description LIKE ? OR r.kelurahan LIKE ?)",
      );
      params.push(...Array(4).fill(`%${search}%`));
    }

    if (kategori) {
      params.push(kategori);
      conditions.push(`r.category_id = ?`);
    }

    // Use stored successful tool results in SQL so filtering also controls totals
    // and pagination, rather than dropping records after a page has been read.
    const duplicate = `EXISTS (SELECT 1 FROM agent_assessments a WHERE a.report_id = r.id AND a.assessment_kind = 'find_duplicates' AND a.assessment_status = 'completed' AND json_valid(a.result) AND json_extract(a.result, '$.duplicates_found') = 1)`;
    const lowMedia = `EXISTS (SELECT 1 FROM agent_assessments a WHERE a.report_id = r.id AND a.assessment_kind = 'assess_media_quality' AND a.assessment_status = 'completed' AND json_valid(a.result) AND json_extract(a.result, '$.quality_ok') = 0)`;
    if (
      [
        "Terindikasi Duplikat",
        "Kemungkinan laporan yang sama",
        "possible_duplicate",
      ].includes(assessment)
    )
      conditions.push(duplicate);
    else if (
      [
        "Kualitas Media Rendah",
        "Foto perlu diperbaiki",
        "photo_needs_improvement",
      ].includes(assessment)
    )
      conditions.push(`NOT ${duplicate} AND ${lowMedia}`);
    else if (
      ["Perlu Verifikasi Manusia", "Perlu diperiksa", "needs_review"].includes(
        assessment,
      )
    )
      conditions.push(`NOT ${duplicate} AND NOT ${lowMedia}`);
    else if (assessment !== "Semua")
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Filter penilaian tidak valid",
          },
        },
        400,
      );

    const whereClause = conditions.join(" AND ");

    const countSql = `SELECT COUNT(*) as total FROM reports r WHERE ${whereClause}`;
    const countR = await c.env.D1.prepare(countSql)
      .bind(...params)
      .first<{ total: string }>();
    const total = parseInt(countR?.total ?? "0", 10);

    const mainSql = `SELECT r.id, r.category_id, r.title, r.description,
            r.lng, r.lat,
            r.status, r.severity, r.photo_urls, r.created_at,
            COALESCE(ps.override_score, ps.computed_score) AS priority_score,
            (SELECT json_object(
              'id', ae.id,
              'status', ae.assessment_status,
              'overall_severity', ae.assessment_status,
              'created_at', ae.created_at
            )
            FROM agent_assessments ae
            WHERE ae.report_id = r.id
            ORDER BY ae.created_at DESC
            LIMIT 1) AS latest_assessment
     FROM reports r
     LEFT JOIN priority_scores ps ON ps.report_id = r.id
     WHERE ${whereClause}
     ORDER BY CASE WHEN priority_score IS NULL THEN 1 ELSE 0 END, priority_score DESC, r.created_at ASC
     LIMIT ? OFFSET ?`;

    const rowsR = await c.env.D1.prepare(mainSql)
      .bind(...params, limit, offset)
      .all();

    const items = await Promise.all(
      (rowsR.results ?? []).map(async (row: Record<string, unknown>) => {
        const latestAssessment =
          typeof row.latest_assessment === "string"
            ? (() => {
                try {
                  return JSON.parse(row.latest_assessment as string);
                } catch {
                  return null;
                }
              })()
            : (row.latest_assessment ?? null);

        const aggregated = await getAggregatedAssessment(c.env, String(row.id));
        const media = aggregated?.tool_results.assess_media_quality as
          { quality_ok?: boolean } | undefined;
        const assessmentType = aggregated?.duplicates_found
          ? "Kemungkinan laporan yang sama"
          : media?.quality_ok === false
            ? "Foto perlu diperbaiki"
            : "Perlu diperiksa";

        return {
          ...row,
          latest_assessment: latestAssessment,
          assessment: assessmentType,
          assessment_code: aggregated?.duplicates_found
            ? "possible_duplicate"
            : media?.quality_ok === false
              ? "photo_needs_improvement"
              : "needs_review",
          aggregated,
          assessment_status: aggregated?.assessment_status ?? "not_started",
          authenticity_score: aggregated?.authenticity_score ?? null,
          authenticity_label:
            aggregated?.authenticity_label ?? "Belum dianalisis",
          ai_damage_type: aggregated?.damage_label ?? "Belum dapat dinilai",
          duplicates_count: aggregated?.duplicate_count ?? 0,
          radius_meters: getConfig(
            c.env as unknown as Record<string, string | undefined>,
          ).DUPLICATE_RADIUS_METERS,
          confidence_label: aggregated
            ? `Tingkat keyakinan: ${Math.round(aggregated.overall_confidence * 100)}%`
            : "Belum dianalisis",
          model_name: c.env.VISION_MODEL_NAME ?? "MiniMax M3",
          model_version: c.env.VISION_MODEL_NAME ?? null,
        };
      }),
    );

    return c.json({
      items: normalizeReportsPhotoUrls(items as { photo_urls?: unknown }[]),
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
