import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import {
  getAssessments,
  getAllAssessments,
  getAssessmentTrace,
  getAggregatedAssessment,
} from "@/lib/agent/store";
import { ID_REGEX } from "@/lib/id";
import { logger } from "@/lib/logger";
import locationTool from "@/lib/agent/tools/locationTimeConsistency";
import { photoKeyFromUrl } from "@/lib/agent/orchestrator";
import { appendAudit } from "@/lib/audit";

export const agentAssessmentsRoute = new Hono<{ Bindings: Env }>();

// Re-evaluate stored photo metadata without invoking a model provider.
agentAssessmentsRoute.post(
  "/:reportId/refresh-location",
  safeHandler(async (c) => {
    const reportId = c.req.param("reportId");
    if (!ID_REGEX.test(reportId))
      return c.json({ error: "Invalid report ID" }, 400);
    const report = await c.env.D1.prepare(
      "SELECT photo_urls FROM reports WHERE id = ?",
    )
      .bind(reportId)
      .first<{ photo_urls: string }>();
    if (!report) return c.json({ error: "Report not found" }, 404);
    const photos: unknown = JSON.parse(report.photo_urls || "[]");
    if (!Array.isArray(photos) || typeof photos[0] !== "string")
      return c.json({ error: "Report has no photo evidence" }, 422);
    const result = await locationTool.execute(c.env, {
      report_id: reportId,
      photo_key: photoKeyFromUrl(photos[0]),
    });
    if (
      result.authenticity_label ===
      "Data lokasi dan waktu foto belum berhasil dibaca"
    )
      return c.json(
        { error: "Location assessment could not be persisted" },
        500,
      );
    await c.env.D1.prepare(
      "UPDATE reports SET facility_card = json_set(facility_card, '$.all_assessments.assess_location_time_consistency', json(?)) WHERE id = ? AND facility_card IS NOT NULL AND json_valid(facility_card)",
    )
      .bind(JSON.stringify(result), reportId)
      .run();
    await appendAudit(c.env, {
      actor: c.get("user").sub,
      activeRole: c.get("user").role,
      action: "location_metadata_refreshed",
      objectType: "report",
      objectId: reportId,
      after: {
        evidence_source: result.evidence_source,
        gps_available: result.exif_gps !== null,
        timestamp_available: result.exif_timestamp !== null,
      },
    });
    return c.json({ result });
  }),
);

agentAssessmentsRoute.get(
  "/",
  safeHandler(async (c) => {
    const reportId = c.req.query("reportId");
    const modelVersion = c.req.query("model_version");

    if (reportId && !ID_REGEX.test(reportId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Valid reportId is required",
          },
        },
        400,
      );
    }

    try {
      const assessments = await getAllAssessments(
        c.env,
        reportId,
        modelVersion,
      );
      return c.json({ assessments });
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err instanceof Error ? err : new Error(String(err)),
        context: "get_all_assessments_failed",
        reportId,
      });
      return c.json({ assessments: [] });
    }
  }),
);

agentAssessmentsRoute.get(
  "/:reportId/detail",
  safeHandler(async (c) => {
    const reportId = c.req.param("reportId");

    if (!ID_REGEX.test(reportId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Valid reportId is required",
          },
        },
        400,
      );
    }

    try {
      const aggregated = await getAggregatedAssessment(c.env, reportId);
      if (!aggregated) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "No assessments found for this report",
            },
          },
          404,
        );
      }

      const assessments = await getAssessments(c.env, reportId);

      const tools = assessments.map((a) => ({
        name: a.tool_name,
        status: a.status as "completed" | "failed" | "timeout",
        confidence: a.confidence,
        model_version: a.model_version,
        result: a.result,
        supporting_factors: a.factors.supporting,
        risk_factors: a.factors.risk,
        created_at: a.created_at,
      }));

      const priorityRow = await c.env.D1.prepare(
        `SELECT computed_score, severity_component, vulnerability_component, population_component,
                sla_component, report_count_component
         FROM priority_scores WHERE report_id = ?`,
      )
        .bind(reportId)
        .first<{
          computed_score: number;
          severity_component: number | null;
          vulnerability_component: number | null;
          population_component: number | null;
          sla_component: number | null;
          report_count_component: number | null;
        }>();

      const priority = priorityRow
        ? {
            score: priorityRow.computed_score,
            breakdown: {
              severity: priorityRow.severity_component ?? 0,
              impact: priorityRow.population_component ?? 0,
              vulnerability: priorityRow.vulnerability_component ?? 0,
              sla: priorityRow.sla_component ?? 0,
              report_count: priorityRow.report_count_component ?? 0,
            },
          }
        : null;

      const display = {
        authenticity: {
          score: aggregated.authenticity_score,
          label: aggregated.authenticity_label,
          percentage:
            aggregated.authenticity_score === null
              ? null
              : `${aggregated.authenticity_score}% konsistensi lokasi dan waktu`,
          available: aggregated.authenticity_score !== null,
        },
        damage: {
          visible: aggregated.tool_results.extract_damage_indicators
            ? aggregated.damage_visible
            : null,
          available: !!aggregated.tool_results.extract_damage_indicators,
          type: aggregated.damage_type,
          label: aggregated.damage_label,
          severity: aggregated.damage_severity,
          severity_label: aggregated.damage_severity_label,
          description: aggregated.damage_description,
        },
        duplication: {
          found: aggregated.tool_results.find_duplicates
            ? aggregated.duplicates_found
            : null,
          count: aggregated.tool_results.find_duplicates
            ? aggregated.duplicate_count
            : null,
          available: !!aggregated.tool_results.find_duplicates,
          level: aggregated.duplication_level,
          summary: aggregated.tool_results.find_duplicates
            ? aggregated.duplication_summary
            : "Belum dapat dinilai",
        },
        privacy: {
          pii_detected: aggregated.tool_results.detect_privacy_risk
            ? aggregated.pii_detected
            : null,
          available: !!aggregated.tool_results.detect_privacy_risk,
          ...((aggregated.tool_results.detect_privacy_risk ?? {}) as Record<
            string,
            unknown
          >),
        },
        completeness: aggregated.tool_results.assess_completeness ?? null,
        media_quality: aggregated.tool_results.assess_media_quality ?? null,
        location_time:
          aggregated.tool_results.assess_location_time_consistency ?? null,
        classification: aggregated.tool_results.classify_problem ?? null,
        duplicate_candidates:
          (
            aggregated.tool_results.find_duplicates as
              { candidates?: unknown[] } | undefined
          )?.candidates ?? [],
        assessment_status: aggregated.assessment_status,
        supporting_factors: aggregated.supporting_factors,
        risk_factors: aggregated.risk_factors,
        assessed_at: aggregated.assessed_at,
        recommended_status: aggregated.recommended_status,
        facility_card: aggregated.facility_card,
      };

      return c.json({
        report_id: reportId,
        aggregated,
        display,
        tools,
        priority,
      });
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err instanceof Error ? err : new Error(String(err)),
        context: "get_assessment_detail_failed",
        reportId,
      });
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch assessment detail",
          },
        },
        500,
      );
    }
  }),
);

agentAssessmentsRoute.get(
  "/:reportId",
  safeHandler(async (c) => {
    const reportId = c.req.param("reportId");
    const modelVersion = c.req.query("model_version");

    if (!ID_REGEX.test(reportId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Valid reportId is required",
          },
        },
        400,
      );
    }

    try {
      const assessments = await getAssessments(c.env, reportId, modelVersion);
      return c.json({ assessments });
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err instanceof Error ? err : new Error(String(err)),
        context: "get_assessments_failed",
        reportId,
      });
      return c.json({ assessments: [] });
    }
  }),
);

agentAssessmentsRoute.get(
  "/trace/:id",
  safeHandler(async (c) => {
    const assessmentId = c.req.param("id");

    if (!ID_REGEX.test(assessmentId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Valid assessment id is required",
          },
        },
        400,
      );
    }

    const assessment = await getAssessmentTrace(c.env, assessmentId);

    if (!assessment) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Assessment not found" } },
        404,
      );
    }

    return c.json({ assessment });
  }),
);
