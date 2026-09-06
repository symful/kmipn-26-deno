import type { Env } from "@/types/bindings";
import { logger } from "@/lib/logger";

export interface AssessmentFactors {
  supporting_factors: string[];
  risk_factors: string[];
  correlation_ids: string[];
}

export interface AssessmentInput {
  tool_name: string;
  report_id: string;
  model_version: string;
  rule_version: string;
  confidence: number;
  supporting_factors: string[];
  risk_factors: string[];
  correlation_ids: string[];
  idempotency_key: string;
  status: string;
  result: Record<string, unknown>;
}

export async function saveAssessment(
  env: Env,
  input: AssessmentInput,
): Promise<string> {
  try {
    const assessmentId = `${input.report_id}_${input.tool_name}`;
    const now = new Date().toISOString();

    await env.D1.prepare(
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
    )
      .bind(
        assessmentId,
        input.report_id,
        input.tool_name,
        input.model_version,
        input.rule_version,
        input.confidence,
        JSON.stringify(input.supporting_factors),
        JSON.stringify(input.risk_factors),
        JSON.stringify(input.correlation_ids),
        input.idempotency_key,
        input.status,
        JSON.stringify(input.result),
        now,
      )
      .run();

    return assessmentId;
  } catch (e) {
    logger.error({
      route: "/internal/agent/assessment",
      method: "SAVE",
      context: "assessment_save_failed",
      tool: input.tool_name,
      report_id: input.report_id,
      error: e instanceof Error ? e : new Error(String(e)),
    });
    throw e;
  }
}

export interface AssessmentResponse {
  id: string;
  report_id: string;
  tool_name: string;
  agent_version: string;
  model_version: string;
  rule_version: string;
  confidence: number;
  factors: {
    supporting: string[];
    risk: string[];
    correlation_ids: string[];
  };
  status: string;
  result: Record<string, unknown>;
  created_at: string;
}

export async function getAssessments(
  env: Env,
  reportId: string,
  modelVersion?: string,
): Promise<AssessmentResponse[]> {
  let query = `SELECT id, report_id, assessment_kind, model_version as agent_version,
                      rule_version, confidence,
                      supporting_factors, risk_factors, correlation_ids,
                      assessment_status, result, created_at
               FROM agent_assessments
               WHERE report_id = ?`;
  const params: (string | undefined)[] = [reportId];

  if (modelVersion) {
    query += ` AND model_version = ?`;
    params.push(modelVersion);
  }

  query += ` ORDER BY created_at ASC`;

  const result = await env.D1.prepare(query)
    .bind(...params)
    .all();
  const rows = result.results ?? [];
  return rows.map((r) => ({
    id: r.id as string,
    report_id: r.report_id as string,
    tool_name: r.assessment_kind as string,
    agent_version: (r.agent_version || "") as string,
    model_version: (r.agent_version || "") as string,
    rule_version: (r.rule_version || "") as string,
    confidence: Number(r.confidence),
    factors: {
      supporting: JSON.parse((r.supporting_factors as string) || "[]"),
      risk: JSON.parse((r.risk_factors as string) || "[]"),
      correlation_ids: JSON.parse((r.correlation_ids as string) || "[]"),
    },
    status: r.assessment_status as string,
    result: readAssessmentResult(r.assessment_kind, r.result),
    created_at: new Date(r.created_at as string).toISOString(),
  }));
}

export async function getAllAssessments(
  env: Env,
  reportId?: string,
  modelVersion?: string,
): Promise<AssessmentResponse[]> {
  const conditions: string[] = [];
  const params: (string | undefined)[] = [];
  let paramIndex = 1;

  if (reportId) {
    conditions.push(`report_id = ?`);
    params.push(reportId);
  }

  if (modelVersion) {
    conditions.push(`model_version = ?`);
    params.push(modelVersion);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await env.D1.prepare(
    `SELECT id, report_id, assessment_kind, model_version as agent_version,
            rule_version, confidence,
            supporting_factors, risk_factors, correlation_ids,
            assessment_status, result, created_at
     FROM agent_assessments
     ${whereClause}
     ORDER BY created_at DESC`,
  )
    .bind(...params)
    .all();

  const rows = result.results ?? [];
  return rows.map((r) => ({
    id: r.id as string,
    report_id: r.report_id as string,
    tool_name: r.assessment_kind as string,
    agent_version: (r.agent_version || "") as string,
    model_version: (r.agent_version || "") as string,
    rule_version: (r.rule_version || "") as string,
    confidence: Number(r.confidence),
    factors: {
      supporting: JSON.parse((r.supporting_factors as string) || "[]"),
      risk: JSON.parse((r.risk_factors as string) || "[]"),
      correlation_ids: JSON.parse((r.correlation_ids as string) || "[]"),
    },
    status: r.assessment_status as string,
    result: readAssessmentResult(r.assessment_kind, r.result),
    created_at: new Date(r.created_at as string).toISOString(),
  }));
}

export async function getAssessmentTrace(
  env: Env,
  assessmentId: string,
): Promise<{
  id: string;
  report_id: string;
  tool_name: string;
  agent_version: string;
  model_version: string;
  rule_version: string;
  confidence: number;
  factors: {
    supporting: string[];
    risk: string[];
    correlation_ids: string[];
  };
  idempotency_key: string | null;
  status: string;
  result: Record<string, unknown>;
  created_at: string;
} | null> {
  const result = await env.D1.prepare(
    `SELECT id, report_id, assessment_kind, model_version as agent_version,
            rule_version, confidence,
            supporting_factors, risk_factors, correlation_ids,
            idempotency_key, assessment_status, result, created_at
     FROM agent_assessments
     WHERE id = ?`,
  )
    .bind(assessmentId)
    .first();
  if (!result) return null;
  const r = result;
  return {
    id: r.id as string,
    report_id: r.report_id as string,
    tool_name: r.assessment_kind as string,
    agent_version: (r.agent_version || "") as string,
    model_version: (r.agent_version || "") as string,
    rule_version: (r.rule_version || "") as string,
    confidence: Number(r.confidence),
    factors: {
      supporting: JSON.parse((r.supporting_factors as string) || "[]"),
      risk: JSON.parse((r.risk_factors as string) || "[]"),
      correlation_ids: JSON.parse((r.correlation_ids as string) || "[]"),
    },
    idempotency_key: r.idempotency_key as string | null,
    status: r.assessment_status as string,
    result: readAssessmentResult(r.assessment_kind, r.result),
    created_at: new Date(r.created_at as string).toISOString(),
  };
}

export interface AggregatedAssessment {
  report_id: string;
  authenticity_score: number | null;
  authenticity_label: string;
  damage_visible: boolean;
  damage_severity: string | null;
  damage_severity_label: string | null;
  damage_type: string | null;
  damage_label: string | null;
  damage_description: string;
  duplicates_found: boolean;
  duplicate_count: number;
  duplication_level: string;
  duplication_summary: string;
  pii_detected: boolean;
  overall_confidence: number;
  recommended_status: string;
  facility_card: Record<string, unknown> | null;
  tool_results: Record<string, unknown>;
  assessment_status: "completed" | "partial" | "failed";
  supporting_factors: string[];
  risk_factors: string[];
  assessed_at: string | null;
}

/**
 * Combine all tool results for a report into a single aggregated assessment.
 * Preserve the location/time tool's explicit score when available.
 * Missing scores remain unknown; consistency alone does not establish authenticity.
 */
export async function getAggregatedAssessment(
  env: Env,
  reportId: string,
): Promise<AggregatedAssessment | null> {
  const assessments = await getAssessments(env, reportId);
  if (assessments.length === 0) return null;

  const toolResults: Record<string, unknown> = {};
  let totalConfidence = 0;
  let completedCount = 0;
  let confidenceCount = 0;

  for (const a of assessments) {
    if (a.status === "completed") {
      toolResults[a.tool_name] = a.result;
      if (a.tool_name !== "collect_field_evidence") {
        totalConfidence += a.confidence;
        confidenceCount++;
      }
      completedCount++;
    }
  }

  const ltcResult = toolResults["assess_location_time_consistency"] as
    | {
        consistent?: boolean;
        authenticity_score?: number;
        authenticity_label?: string;
        distance_meters?: number;
      }
    | undefined;

  let authenticityScore: number | null;
  let authenticityLabel: string;
  if (ltcResult && typeof ltcResult.authenticity_score === "number") {
    authenticityScore = ltcResult.authenticity_score;
    authenticityLabel =
      ltcResult.authenticity_label ??
      (ltcResult.consistent
        ? "Lokasi dan waktu foto sesuai dengan laporan"
        : "Lokasi atau waktu foto berbeda dari laporan");
  } else {
    authenticityScore = null;
    authenticityLabel =
      ltcResult?.authenticity_label ??
      "Belum ada hasil pemeriksaan lokasi dan waktu foto";
  }

  const damageResult = toolResults["extract_damage_indicators"] as
    | {
        damage_visible?: boolean;
        severity?: string;
        severity_label?: string;
        damage_type?: string;
        damage_label?: string;
        damage_description?: string;
      }
    | undefined;

  const damageVisible = damageResult?.damage_visible ?? false;
  const damageSeverity = damageResult?.severity ?? null;
  const damageSeverityLabel = damageResult?.severity_label ?? null;
  const damageType = damageResult?.damage_type ?? null;
  const damageLabel = damageResult?.damage_label ?? null;
  const damageDescription =
    damageResult?.damage_description ??
    (damageResult
      ? damageVisible
        ? "Kerusakan teridentifikasi"
        : "Tidak ada kerusakan terlihat"
      : "Belum dapat dinilai");

  const dupResult = toolResults["find_duplicates"] as
    | {
        duplicates_found?: boolean;
        duplicate_count?: number;
        duplication_level?: string;
        duplication_summary?: string;
        candidates?: unknown[];
      }
    | undefined;

  const duplicatesFound = dupResult?.duplicates_found ?? false;
  const duplicateCount =
    dupResult?.duplicate_count ?? dupResult?.candidates?.length ?? 0;
  const duplicationLevel =
    dupResult?.duplication_level ??
    (duplicateCount === 0
      ? "none"
      : duplicateCount <= 2
        ? "low"
        : duplicateCount <= 5
          ? "medium"
          : "high");
  const duplicationSummary =
    dupResult?.duplication_summary ??
    (duplicatesFound
      ? `${duplicationLevel} (${duplicateCount} laporan mengarah pada objek yang sama)`
      : "Tidak ada duplikasi terdeteksi");

  const piiResult = toolResults["detect_privacy_risk"] as
    | {
        pii_detected?: boolean;
      }
    | undefined;

  const lastAssessment = assessments[assessments.length - 1];
  const recommendedStatus = (lastAssessment?.result as Record<string, unknown>)
    ?.recommended_status as string | undefined;

  const reportRow = await env.D1.prepare(
    `SELECT facility_card, ai_recommended_status FROM reports WHERE id = ?`,
  )
    .bind(reportId)
    .first<{
      facility_card: string | null;
      ai_recommended_status: string | null;
    }>();
  let facilityCard: Record<string, unknown> | null = null;
  if (reportRow?.facility_card) {
    try {
      facilityCard = JSON.parse(reportRow.facility_card);
    } catch {
      facilityCard = null;
    }
  }

  return {
    report_id: reportId,
    authenticity_score: authenticityScore,
    authenticity_label: authenticityLabel,
    damage_visible: damageVisible,
    damage_severity: damageSeverity,
    damage_severity_label: damageSeverityLabel,
    damage_type: damageType,
    damage_label: damageLabel,
    damage_description: damageDescription,
    duplicates_found: duplicatesFound,
    duplicate_count: duplicateCount,
    duplication_level: duplicationLevel,
    duplication_summary: duplicationSummary,
    pii_detected: piiResult?.pii_detected ?? false,
    overall_confidence:
      confidenceCount > 0
        ? Math.round((totalConfidence / confidenceCount) * 100) / 100
        : 0,
    recommended_status:
      reportRow?.ai_recommended_status ?? recommendedStatus ?? "needs_review",
    facility_card: facilityCard,
    tool_results: toolResults,
    assessment_status:
      completedCount === 0
        ? "failed"
        : completedCount === assessments.length
          ? "completed"
          : "partial",
    supporting_factors: [
      ...new Set(assessments.flatMap((a) => a.factors.supporting)),
    ],
    risk_factors: [...new Set(assessments.flatMap((a) => a.factors.risk))],
    assessed_at: assessments.at(-1)?.created_at ?? null,
  };
}

export function flattenAssessment<T extends Record<string, unknown>>(row: {
  assessment_kind: string;
  assessment_status: string;
  confidence: number;
  result: T;
  created_at: Date | string;
}): {
  kind: string;
  status: string;
  confidence: number;
  created_at: string;
} & T {
  const { assessment_kind, assessment_status, confidence, result, created_at } =
    row;
  return {
    kind: assessment_kind,
    status: assessment_status,
    confidence: Number(confidence),
    created_at: new Date(created_at).toISOString(),
    ...result,
  };
}

// Update legacy presentation text on reads without changing stored findings or scores.
function readAssessmentResult(
  kind: unknown,
  serialized: unknown,
): Record<string, unknown> {
  const result = JSON.parse(
    typeof serialized === "string" ? serialized : "{}",
  ) as Record<string, unknown>;
  if (kind !== "assess_location_time_consistency") return result;
  const labels: Record<string, string> = {
    "Konsistensi EXIF berdasarkan aturan toleransi; bukan bukti keaslian":
      "Lokasi dan waktu foto sesuai dengan laporan",
    "GPS & Timestamp valid": "Lokasi dan waktu foto sesuai dengan laporan",
    "GPS & Timestamp tidak konsisten":
      "Lokasi dan waktu foto berbeda dari laporan",
    "Lokasi GPS tidak sesuai": "Lokasi foto berbeda dari lokasi laporan",
    "Timestamp tidak sesuai": "Waktu foto berbeda dari waktu laporan",
    "Error ekstraksi EXIF": "Data lokasi dan waktu foto belum berhasil dibaca",
    "Skor konsistensi lokasi dan waktu belum tersedia":
      "Belum ada hasil pemeriksaan lokasi dan waktu foto",
  };
  const oldLabel = result.authenticity_label;
  if (typeof oldLabel === "string" && labels[oldLabel])
    result.authenticity_label = labels[oldLabel];
  if (oldLabel === "Data pembanding GPS atau waktu belum lengkap") {
    result.authenticity_label =
      result.distance_meters == null && result.time_delta_hours == null
        ? "Lokasi dan waktu foto belum dapat dibandingkan"
        : result.distance_meters == null
          ? "Lokasi pengambilan foto belum dapat dibandingkan"
          : "Waktu pengambilan foto belum dapat dibandingkan";
  }
  return result;
}
