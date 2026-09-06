import type { Env } from "@/types/bindings";

import { allTools, type ToolName } from "@/lib/agent/tools";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { getConfig } from "@/config/env";
import { logger } from "@/lib/logger";

import { saveAssessment } from "@/lib/agent/store";
import { evaluatePriority } from "@/lib/priority/calculator";

export interface AssessmentSummary {
  report_id: string;
  overall_status: "completed" | "partial" | "failed";
  authenticity_score: number | null;
  authenticity_label: string;
  damage_summary: {
    visible: boolean | null;
    type: string | null;
    label: string | null;
    severity: string | null;
    severity_label: string | null;
    description: string;
  };
  duplication_summary: {
    found: boolean | null;
    count: number | null;
    level: string | null;
    description: string;
  };
  facility_card_id: string | null;
  tool_results: Record<string, unknown>;
}

function getToolTimeoutMs(env: Env): number {
  return getConfig(env as unknown as Record<string, string | undefined>)
    .TOOL_TIMEOUT_MS;
}

function getMaxRetries(env: Env): number {
  return getConfig(env as unknown as Record<string, string | undefined>)
    .MAX_RETRIES;
}

interface ToolResult {
  status: "fulfilled" | "rejected";
  value?: unknown;
  error?: string;
}

async function withTimeout<T>(
  promise: Promise<T>,
  toolName: string,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const abortPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new Error(`Timeout: ${toolName} exceeded ${timeoutMs / 1000}s`));
    });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.message.includes("Timeout")) {
      return true;
    }
    if (error.message.includes("5") && error.message.includes("status")) {
      return true;
    }
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries && isRetryableError(e)) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } else if (attempt >= maxRetries) {
        break;
      }
    }
  }
  throw lastError!;
}

type ToolExecuteFn = (env: Env, input: unknown) => Promise<unknown>;

async function executeToolWithRetry(
  toolName: ToolName,
  execute: ToolExecuteFn,
  env: Env,
  input: unknown,
): Promise<ToolResult> {
  try {
    const timeoutMs = getToolTimeoutMs(env);
    const maxRetries = getMaxRetries(env);
    const result = await withRetry(
      () => withTimeout(execute(env, input), toolName, timeoutMs),
      maxRetries,
    );
    return { status: "fulfilled", value: result };
  } catch (e) {
    return { status: "rejected", error: (e as Error).message };
  }
}

export function aggregateAssessments(
  results: Record<string, ToolResult>,
): string {
  return deriveRecommendedStatus(results);
}

function deriveRecommendedStatus(results: Record<string, ToolResult>): string {
  let highestPriority = "unknown";

  const completenessResult = results.assess_completeness;
  if (!completenessResult || completenessResult.status === "rejected") {
  } else {
    const completeness = completenessResult.value as
      { complete?: boolean; status?: string } | undefined;
    if (completeness && !completeness.complete) {
      return "needs_info";
    }
  }

  const damageResult = results.extract_damage_indicators;
  if (damageResult && damageResult.status === "fulfilled") {
    const damage = damageResult.value as
      { severity?: string; damage_visible?: boolean } | undefined;
    if (damage?.damage_visible) {
      const severityPriority: Record<string, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
        unknown: 0,
      };
      const currentPriority = severityPriority[highestPriority] ?? 0;
      const newPriority = severityPriority[damage.severity ?? "unknown"] ?? 0;
      if (newPriority > currentPriority) {
        highestPriority = damage.severity ?? "unknown";
      }
    }
  }

  const privacyResult = results.detect_privacy_risk;
  if (privacyResult && privacyResult.status === "fulfilled") {
    const privacy = privacyResult.value as { risk_level?: string } | undefined;
    if (privacy?.risk_level === "high") {
      return "needs_review";
    }
  }

  const duplicatesResult = results.find_duplicates;
  if (duplicatesResult && duplicatesResult.status === "fulfilled") {
    const duplicates = duplicatesResult.value as
      { duplicates_found?: boolean } | undefined;
    if (duplicates?.duplicates_found) {
      return "duplicate";
    }
  }

  return highestPriority === "unknown" ? "verified" : highestPriority;
}

function deriveUrgency(results: Record<string, ToolResult>): number {
  let urgency = 0;

  const damageResult = results.extract_damage_indicators;
  if (damageResult && damageResult.status === "fulfilled") {
    const damage = damageResult.value as
      { severity?: string; damage_visible?: boolean } | undefined;
    if (damage?.damage_visible) {
      const severityScores: Record<string, number> = {
        high: 3,
        medium: 2,
        low: 1,
        unknown: 0,
      };
      urgency += severityScores[damage.severity ?? "unknown"] ?? 0;
    }
  }

  const privacyResult = results.detect_privacy_risk;
  if (privacyResult && privacyResult.status === "fulfilled") {
    const privacy = privacyResult.value as { risk_level?: string } | undefined;
    if (privacy?.risk_level === "high") {
      urgency += 1;
    }
  }

  const locationResult = results.assess_location_time_consistency;
  if (locationResult && locationResult.status === "fulfilled") {
    const location = locationResult.value as
      { consistent?: boolean } | undefined;
    if (location?.consistent === false) {
      urgency += 1;
    }
  }

  const duplicatesResult = results.find_duplicates;
  if (duplicatesResult && duplicatesResult.status === "fulfilled") {
    const duplicates = duplicatesResult.value as
      { duplicates_found?: boolean } | undefined;
    if (duplicates?.duplicates_found) {
      urgency += 1;
    }
  }

  return Math.min(5, urgency);
}

function deriveSeverityScore(
  results: Record<string, ToolResult>,
): number | null {
  let score = 0;
  const damage = results.extract_damage_indicators;
  if (!damage || damage.status !== "fulfilled") return null;
  if (damage && damage.status === "fulfilled") {
    const d = (damage.value ?? {}) as {
      severity?: string;
      damage_visible?: boolean;
    };
    if (d.damage_visible) {
      const severityBase: Record<string, number> = {
        critical: 95,
        high: 85,
        medium: 55,
        low: 30,
      };
      const assessedScore = severityBase[d.severity ?? "unknown"];
      if (assessedScore == null) return null;
      score = assessedScore;
    }
  }
  const urgency = deriveUrgency(results); // 0-5
  score = Math.min(100, score + urgency * 4);
  return score;
}

function buildAuthenticityScore(
  results: Record<string, ToolResult>,
): number | null {
  const ltc = results.assess_location_time_consistency;
  if (ltc && ltc.status === "fulfilled") {
    const data = ltc.value as {
      authenticity_score?: number;
      consistent?: boolean;
      distance_meters?: number;
    };
    if (typeof data.authenticity_score === "number")
      return data.authenticity_score;
  }
  return null;
}

function buildAuthenticityLabel(results: Record<string, ToolResult>): string {
  const ltc = results.assess_location_time_consistency;
  if (ltc && ltc.status === "fulfilled") {
    const data = ltc.value as {
      authenticity_label?: string;
      consistent?: boolean;
    };
    if (data.authenticity_label) return data.authenticity_label;
    if (data.consistent) return "GPS & Timestamp valid";
    return "Data tidak konsisten";
  }
  return "Data EXIF tidak tersedia";
}

function buildDamageSummary(
  results: Record<string, ToolResult>,
): AssessmentSummary["damage_summary"] {
  const damage = results.extract_damage_indicators;
  if (damage && damage.status === "fulfilled") {
    const d = damage.value as {
      damage_visible?: boolean;
      damage_type?: string;
      damage_label?: string;
      damage_description?: string;
      severity?: string;
      severity_label?: string;
    };
    return {
      visible: d.damage_visible ?? false,
      type: d.damage_type ?? null,
      label: d.damage_label ?? null,
      severity: d.severity ?? null,
      severity_label: d.severity_label ?? null,
      description:
        d.damage_description ??
        (d.damage_visible
          ? "Kerusakan teridentifikasi"
          : "Tidak ada kerusakan terlihat"),
    };
  }
  return {
    visible: null,
    type: null,
    label: null,
    severity: null,
    severity_label: null,
    description: "Belum dianalisis",
  };
}

function buildDuplicationSummary(
  results: Record<string, ToolResult>,
): AssessmentSummary["duplication_summary"] {
  const dups = results.find_duplicates;
  if (dups && dups.status === "fulfilled") {
    const d = dups.value as {
      duplicates_found?: boolean;
      duplicate_count?: number;
      duplication_level?: string;
      duplication_summary?: string;
      candidates?: unknown[];
    };
    const count = d.duplicate_count ?? d.candidates?.length ?? 0;
    const level =
      d.duplication_level ??
      (count === 0
        ? "none"
        : count <= 2
          ? "low"
          : count <= 5
            ? "medium"
            : "high");
    return {
      found: d.duplicates_found ?? false,
      count,
      level,
      description:
        d.duplication_summary ??
        (count === 0
          ? "Tidak ada duplikasi terdeteksi"
          : `${level} (${count} laporan mengarah pada objek yang sama)`),
    };
  }
  return {
    found: null,
    count: null,
    level: null,
    description: "Belum dapat dinilai",
  };
}

interface ReportMeta {
  id: string;
  lng: number;
  lat: number;
  category_id: string;
  photo_urls: string[] | null;
  description: string;
  category_name: string;
  title: string | null;
  facility_card_id: string | null;
}

async function loadReportMeta(
  env: Env,
  reportId: string,
): Promise<ReportMeta | null> {
  const result = await env.D1.prepare(
    `SELECT r.id, r.lng, r.lat, r.category_id, r.photo_urls, r.description, c.name AS category_name, r.title, r.facility_card_id
     FROM reports r
     JOIN categories c ON c.id = r.category_id
     WHERE r.id = ?`,
  )
    .bind(reportId)
    .first<ReportMeta>();
  if (!result) return null;
  const rawPhotos = (result as { photo_urls: unknown }).photo_urls;
  let photos: string[] = [];
  if (Array.isArray(rawPhotos)) {
    photos = rawPhotos.filter((p): p is string => typeof p === "string");
  } else if (typeof rawPhotos === "string" && rawPhotos.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(rawPhotos);
      if (Array.isArray(parsed))
        photos = parsed.filter((p): p is string => typeof p === "string");
    } catch {
      photos = [];
    }
  }
  return { ...result, photo_urls: photos };
}

async function finalizeAssessment(
  env: Env,
  reportId: string,
  meta: ReportMeta,
  toolResults: Record<string, ToolResult>,
  finalText: string,
): Promise<AssessmentSummary> {
  const photoUrls = meta.photo_urls || [];

  const results: Record<string, ToolResult> = { ...toolResults };
  let hasFailure = false;
  let hasSuccess = false;

  const batchStatements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();

  for (const [toolName, result] of Object.entries(results)) {
    if (result.status === "fulfilled") {
      hasSuccess = true;
      const idempotencyKey = `${toolName}_${reportId}_${crypto.randomUUID()}`;
      const assessmentId = `${reportId}_${toolName}`;
      batchStatements.push(
        env.D1.prepare(
          `INSERT INTO agent_assessments (
            id, report_id, assessment_kind, model_version, rule_version, confidence,
            supporting_factors, risk_factors, correlation_ids,
            idempotency_key, assessment_status, result, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            model_version = excluded.model_version,
            rule_version = excluded.rule_version,
            confidence = excluded.confidence,
            supporting_factors = excluded.supporting_factors,
            risk_factors = excluded.risk_factors,
            correlation_ids = excluded.correlation_ids,
            idempotency_key = excluded.idempotency_key,
            assessment_status = excluded.assessment_status,
            result = excluded.result,
            retry_count = 0,
            last_error = NULL,
            next_retry_at = NULL,
            created_at = excluded.created_at`,
        ).bind(
          assessmentId,
          reportId,
          toolName,
          toolName === "detect_privacy_risk"
            ? `${env.TEXT_MODEL_NAME}+${env.VISION_MODEL_NAME}`
            : allTools[toolName as ToolName]?.model === "vision"
              ? getConfig(env as unknown as Record<string, string | undefined>)
                  .VISION_MODEL_NAME
              : allTools[toolName as ToolName]?.model === "text"
                ? getConfig(
                    env as unknown as Record<string, string | undefined>,
                  ).TEXT_MODEL_NAME
                : "rules-v1",
          "1.0.0",
          result.value !== undefined
            ? ((result.value as { confidence?: number })?.confidence ?? 0)
            : 0,
          JSON.stringify(
            (result.value as { supporting_factors?: string[] })
              ?.supporting_factors ?? [],
          ),
          JSON.stringify(
            (result.value as { risk_factors?: string[] })?.risk_factors ?? [],
          ),
          JSON.stringify(
            (result.value as { correlation_ids?: string[] })
              ?.correlation_ids ?? [reportId],
          ),
          idempotencyKey,
          "completed",
          JSON.stringify(result.value as Record<string, unknown>),
          now,
        ),
      );
    } else {
      hasFailure = true;
      await saveAssessment(env, {
        tool_name: toolName,
        report_id: reportId,
        model_version: env.TEXT_MODEL_NAME ?? "unknown",
        rule_version: "1.0.0",
        confidence: 0,
        supporting_factors: [],
        risk_factors: [result.error ?? "Assessment unavailable"],
        correlation_ids: [reportId],
        idempotency_key: `${reportId}_${toolName}_${crypto.randomUUID()}`,
        status: "failed",
        result: { error: result.error ?? "Assessment unavailable" },
      });
      const nextRetryAt = new Date(Date.now() + 3600000).toISOString();
      batchStatements.push(
        env.D1.prepare(
          `UPDATE agent_assessments SET
            retry_count = ?,
            last_error = ?,
            next_retry_at = ?
          WHERE report_id = ? AND assessment_kind = ?`,
        ).bind(
          0,
          result.error ?? "Unknown error",
          nextRetryAt,
          reportId,
          toolName,
        ),
      );
    }
  }

  const allAssessments: Record<string, unknown> = {};
  for (const [toolName, result] of Object.entries(results)) {
    if (result.status === "fulfilled" && result.value !== undefined) {
      allAssessments[toolName] = result.value;
    }
  }

  let overall_status: AssessmentSummary["overall_status"] = "completed";
  if (hasFailure && hasSuccess) {
    overall_status = "partial";
  } else if (hasFailure && !hasSuccess) {
    overall_status = "failed";
  }

  const recommendedStatus = deriveRecommendedStatus(results);

  const facilityCard = {
    location: { lat: meta.lat, lng: meta.lng },
    type: meta.category_name ?? "unknown",
    urgency: deriveUrgency(results),
    photo_gallery: photoUrls,
    recommended_status: recommendedStatus,
    all_assessments: allAssessments,
  };

  const severityScore = deriveSeverityScore(results);

  batchStatements.push(
    env.D1.prepare(
      `UPDATE reports SET facility_card = ?, ai_recommended_status = ?, severity = COALESCE(?, severity), updated_at = datetime('now') WHERE id = ?`,
    ).bind(
      JSON.stringify(facilityCard),
      hasSuccess ? recommendedStatus : "needs_review",
      severityScore,
      reportId,
    ),
  );

  await env.D1.batch(batchStatements);
  await env.D1.prepare(
    "DELETE FROM agent_assessments WHERE report_id = ? AND assessment_kind = 'orchestrator_error'",
  )
    .bind(reportId)
    .run();
  await evaluatePriority(env, reportId);

  return {
    report_id: reportId,
    overall_status,
    authenticity_score: buildAuthenticityScore(results),
    authenticity_label: buildAuthenticityLabel(results),
    damage_summary: buildDamageSummary(results),
    duplication_summary: buildDuplicationSummary(results),
    facility_card_id: meta.facility_card_id,
    tool_results: results,
  };
}

export async function runAssessment(
  env: Env,
  reportId: string,
): Promise<AssessmentSummary> {
  const meta = await loadReportMeta(env, reportId);
  if (!meta) {
    return {
      report_id: reportId,
      overall_status: "failed",
      authenticity_score: null,
      authenticity_label: "Laporan tidak ditemukan",
      damage_summary: {
        visible: null,
        type: null,
        label: null,
        severity: null,
        severity_label: null,
        description: "Belum dianalisis",
      },
      duplication_summary: {
        found: null,
        count: null,
        level: null,
        description: "Belum dapat dinilai",
      },
      facility_card_id: null,
      tool_results: {},
    };
  }

  try {
    // Every button click runs the complete UI assessment contract. A planner
    // must not silently skip completeness, EXIF, privacy or duplicate checks.
    const toolResults: Record<string, ToolResult> = {};
    const photoUrls = (meta.photo_urls ?? []).map((url) =>
      url.startsWith("/") ? new URL(url, env.R2_PUBLIC_URL).toString() : url,
    );
    const firstPhoto = photoUrls[0];
    const common = {
      report_id: reportId,
      category_id: meta.category_id,
      category_name: meta.category_name,
      description: meta.description,
      lat: meta.lat,
      lng: meta.lng,
      photo_urls: photoUrls,
    };
    const checks: Array<[ToolName, Record<string, unknown>]> = [
      ["collect_field_evidence", common],
      ["assess_completeness", common],
      ["find_duplicates", common],
      ["classify_problem", common],
      ["detect_privacy_risk", common],
    ];
    if (firstPhoto) {
      checks.push(
        ["assess_media_quality", { ...common, image_url: firstPhoto }],
        ["extract_damage_indicators", { ...common, image_url: firstPhoto }],
        [
          "assess_location_time_consistency",
          { ...common, photo_key: photoKeyFromUrl(firstPhoto) },
        ],
      );
    } else {
      for (const name of [
        "assess_media_quality",
        "extract_damage_indicators",
        "assess_location_time_consistency",
      ]) {
        toolResults[name] = {
          status: "rejected",
          error:
            "Foto belum tersedia; unggah bukti untuk menjalankan pemeriksaan ini.",
        };
      }
    }
    await Promise.all(
      checks.map(async ([name, input]) => {
        const tool = allTools[name];
        const parsed = tool.inputSchema.safeParse(input);
        toolResults[name] = parsed.success
          ? await executeToolWithRetry(
              name,
              tool.execute as ToolExecuteFn,
              env,
              parsed.data,
            )
          : {
              status: "rejected",
              error:
                "Data pemeriksaan belum lengkap: " +
                parsed.error.issues
                  .map((issue) => issue.path.join(".") + ": " + issue.message)
                  .join("; "),
            };
      }),
    );
    return await finalizeAssessment(
      env,
      reportId,
      meta,
      toolResults,
      "Assessment complete",
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMsg.includes("Timeout");
    const isVlm = /HTTP [45]\d{2}|llm_call_failed/i.test(errorMsg);
    const terminalStatus = isTimeout
      ? "timeout"
      : isVlm
        ? "vlm_error"
        : "parse_failed";

    logger.error({
      route: "/api/agent",
      method: "POST",
      context: "runAssessment_failed",
      report_id: reportId,
      terminal_status: terminalStatus,
      error: err instanceof Error ? err : new Error(errorMsg),
    });

    const idempotencyKey = `error_${reportId}_${crypto.randomUUID()}`;
    await env.D1.prepare(
      `INSERT INTO agent_assessments (
        id, report_id, assessment_kind, model_version, rule_version, confidence,
        supporting_factors, risk_factors, correlation_ids,
        idempotency_key, assessment_status, result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `${reportId}_error`,
        reportId,
        "orchestrator_error",
        env.TEXT_MODEL_NAME ?? "unknown",
        "1.0.0",
        0,
        JSON.stringify([]),
        JSON.stringify([errorMsg.slice(0, 500)]),
        JSON.stringify([idempotencyKey]),
        idempotencyKey,
        terminalStatus,
        JSON.stringify({ error: errorMsg.slice(0, 500) }),
        new Date().toISOString(),
      )
      .run()
      .catch((e) =>
        logger.error({
          route: "/api/agent",
          method: "POST",
          context: "error_assessment_insert_failed",
          report_id: reportId,
          error: e instanceof Error ? e : new Error(String(e)),
        }),
      );

    // Dead-letter: also record in failed_assessments for admin visibility
    const dlqId = `dlq_${reportId}_${Date.now()}`;
    await env.D1.prepare(
      `INSERT INTO failed_assessments (id, report_id, tool_name, error, failed_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
      .bind(dlqId, reportId, "orchestrator_error", errorMsg.slice(0, 500))
      .run()
      .catch((e) =>
        logger.error({
          route: "/api/agent",
          method: "POST",
          context: "dead_letter_insert_failed",
          report_id: reportId,
          error: e instanceof Error ? e : new Error(String(e)),
        }),
      );

    return {
      report_id: reportId,
      overall_status: "failed",
      authenticity_score: null,
      authenticity_label: "Assessment gagal",
      damage_summary: {
        visible: null,
        type: null,
        label: null,
        severity: null,
        severity_label: null,
        description: "Belum dianalisis",
      },
      duplication_summary: {
        found: null,
        count: null,
        level: null,
        description: "Belum dapat dinilai",
      },
      facility_card_id: null,
      tool_results: {},
    };
  }
}

export function photoKeyFromUrl(url: string): string {
  const path = url.startsWith("reports/")
    ? url
    : new URL(url, "https://local.invalid").pathname.replace(
        /^\/(?:r2\/)?/,
        "",
      );
  const match = path.match(
    /^reports\/(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/,
  );
  if (!match) {
    throw new Error(`Invalid photo URL format: ${url}`);
  }
  return match[0];
}
