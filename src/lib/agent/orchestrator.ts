import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { allTools, type ToolName } from "@/lib/agent/tools";
import { saveAssessment } from "@/lib/agent/store";
import { getConfig } from "@/config/env";
import { logger } from "@/lib/logger";
import {
  buildOpenAIToolDefinitions,
  callLLMWithMessages,
  type LLMChatMessage,
} from "@/lib/agent/llm";
import type { ToolDescriptor } from "@/lib/agent/llm";

export interface AssessmentSummary {
  report_id: string;
  overall_status: "completed" | "partial" | "failed";
  tool_results: Record<string, unknown>;
}

function getToolTimeoutMs(env: Env): number {
  return getConfig(env as unknown as Record<string, string | undefined>).TOOL_TIMEOUT_MS;
}

function getMaxRetries(env: Env): number {
  return getConfig(env as unknown as Record<string, string | undefined>).MAX_RETRIES;
}

function getMaxIterations(env: Env): number {
  return getConfig(env as unknown as Record<string, string | undefined>).MAX_ITERATIONS;
}

interface ToolResult {
  status: "fulfilled" | "rejected";
  value?: unknown;
  error?: string;
}

interface FailedAssessmentRecord {
  report_id: string;
  tool_name: string;
  error: string;
  failed_at: Date;
  retry_count?: number;
  last_error?: string;
  permanent_dlq?: boolean;
  next_retry_at?: Date;
}

async function withTimeout<T>(promise: Promise<T>, toolName: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const abortPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
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

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
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

/**
 * Executes a tool with timeout and retry
 */
async function executeToolWithRetry(
  toolName: ToolName,
  execute: ToolExecuteFn,
  env: Env,
  input: unknown
): Promise<ToolResult> {
  try {
    const timeoutMs = getToolTimeoutMs(env);
    const maxRetries = getMaxRetries(env);
    const result = await withRetry(() => withTimeout(execute(env, input), toolName, timeoutMs), maxRetries);
    return { status: "fulfilled", value: result };
  } catch (e) {
    return { status: "rejected", error: (e as Error).message };
  }
}

/**
 * Saves a failed assessment to the failed_assessments table
 */
async function saveFailedAssessment(env: Env, record: FailedAssessmentRecord): Promise<void> {
  await withClient(env, async (client) => {
    await client.query(
      `INSERT INTO failed_assessments (report_id, tool_name, error, failed_at, retry_count, last_error, permanent_dlq, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        record.report_id,
        record.tool_name,
        record.error,
        record.failed_at,
        record.retry_count ?? 0,
        record.last_error ?? record.error,
        record.permanent_dlq ?? false,
        record.next_retry_at ?? new Date(Date.now() + 3600000),
      ]
    );
  });
}

/**
 * Updates the ai_recommended_status column on the report
 */
async function updateAiRecommendedStatus(
  env: Env,
  reportId: string,
  recommendedStatus: string
): Promise<void> {
  await withClient(env, async (client) => {
    await client.query(
      `UPDATE reports SET ai_recommended_status = $1 WHERE id = $2`,
      [recommendedStatus, reportId]
    );
  });
}

/**
 * Updates the facility_card JSONB column on the report
 */
async function updateFacilityCard(
  env: Env,
  reportId: string,
  facilityCard: Record<string, unknown>
): Promise<void> {
  await withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE reports SET facility_card = $1::jsonb WHERE id = $2`,
        [JSON.stringify(facilityCard), reportId]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

async function consolidateReport(
  env: Env,
  reportId: string
): Promise<{ facility_card_id: string; action: "created" | "merged" | "already_linked" } | null> {
  const duplicateRadius = getConfig(env as unknown as Record<string, string | undefined>).DUPLICATE_RADIUS_METERS;
  return await withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      const reportR = await client.query<{
        id: string;
        category_id: string;
        lng: number;
        lat: number;
        facility_card_id: string | null;
      }>(
        `SELECT id, category_id, ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat,
                facility_card_id
         FROM reports WHERE id = $1`,
        [reportId]
      );

      if (!reportR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      const report = reportR.rows[0];

      if (report.facility_card_id) {
        await client.query("COMMIT");
        return { facility_card_id: report.facility_card_id, action: "already_linked" };
      }

      const nearbyR = await client.query<{ id: string }>(
        `SELECT r.id FROM reports r
         WHERE r.category_id = $1
           AND r.id != $2
           AND r.facility_card_id IS NULL
           AND r.status NOT IN ('rejected', 'duplicate_merged')
           AND ST_DWithin(
             r.geom,
             ST_MakePoint($3, $4)::geography,
             $5
           )
         ORDER BY r.created_at ASC
         LIMIT 10`,
        [report.category_id, reportId, report.lng, report.lat, duplicateRadius]
      );

      const nearbyIds = nearbyR.rows.map((r) => r.id);
      const allReportIds = [reportId, ...nearbyIds];

      const existingCardR = await client.query<{ id: string }>(
        `SELECT fc.id FROM facility_cards fc
         JOIN reports r ON r.facility_card_id = fc.id
         WHERE r.id = ANY($1)
         LIMIT 1`,
        [allReportIds]
      );

      let facilityCardId: string;

      if (existingCardR.rows[0]) {
        facilityCardId = existingCardR.rows[0].id;
      } else {
        const facilityCardR = await client.query<{ id: string }>(
          `INSERT INTO facility_cards (primary_report_id, category_id, location, status)
           VALUES ($1, $2, ST_MakePoint($3, $4)::geography, 'active')
           RETURNING id`,
          [reportId, report.category_id, report.lng, report.lat]
        );
        if (!facilityCardR.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        facilityCardId = facilityCardR.rows[0].id;
      }

      for (const rid of allReportIds) {
        await client.query(
          `UPDATE reports SET facility_card_id = $1, updated_at = NOW() WHERE id = $2`,
          [facilityCardId, rid]
        );
      }

      await client.query("COMMIT");
      return { facility_card_id: facilityCardId, action: existingCardR.rows[0] ? "merged" : "created" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * Aggregates assessment results from multiple tools into a recommended status.
 * This is the main entry point for AI status aggregation.
 */
export function aggregateAssessments(results: Record<string, ToolResult>): string {
  return deriveRecommendedStatus(results);
}

/**
 * Derives recommended_status from assessment results
 */
function deriveRecommendedStatus(results: Record<string, ToolResult>): string {
  // Priority order: critical > high > medium > low > unknown
  const priorityOrder = ["critical", "high", "medium", "low", "unknown"];

  let highestPriority = "unknown";

  // Check completeness tool
  const completenessResult = results.assess_completeness;
  if (!completenessResult || completenessResult.status === "rejected") {
    // skip — tool failed, don't contribute to status
  } else {
    const completeness = completenessResult.value as { complete?: boolean; status?: string } | undefined;
    if (completeness && !completeness.complete) {
      return "needs_info";
    }
  }

  // Check damage extraction
  const damageResult = results.extract_damage_indicators;
  if (damageResult && damageResult.status === "fulfilled") {
    const damage = damageResult.value as { severity?: string; damage_visible?: boolean } | undefined;
    if (damage?.damage_visible) {
      const severityPriority: Record<string, number> = { high: 3, medium: 2, low: 1, unknown: 0 };
      const currentPriority = priorityOrder.indexOf(highestPriority);
      const newPriority = severityPriority[damage.severity ?? "unknown"] ?? 0;
      if (newPriority > currentPriority) {
        highestPriority = damage.severity ?? "unknown";
      }
    }
  }

  // Check privacy risk
  const privacyResult = results.detect_privacy_risk;
  if (privacyResult && privacyResult.status === "fulfilled") {
    const privacy = privacyResult.value as { risk_level?: string } | undefined;
    if (privacy?.risk_level === "high") {
      return "needs_review"; // High privacy risk needs human review
    }
  }

  // Check duplicates
  const duplicatesResult = results.find_duplicates;
  if (duplicatesResult && duplicatesResult.status === "fulfilled") {
    const duplicates = duplicatesResult.value as { duplicates_found?: boolean } | undefined;
    if (duplicates?.duplicates_found) {
      return "duplicate";
    }
  }

  // Default based on severity
  return highestPriority === "unknown" ? "verified" : highestPriority;
}

/**
 * Derives urgency score from assessment results (0-5)
 */
function deriveUrgency(results: Record<string, ToolResult>): number {
  let urgency = 0;

  // Damage severity contributes up to 3 points
  const damageResult = results.extract_damage_indicators;
  if (damageResult && damageResult.status === "fulfilled") {
    const damage = damageResult.value as { severity?: string; damage_detected?: boolean } | undefined;
    if (damage?.damage_detected) {
      const severityScores: Record<string, number> = { high: 3, medium: 2, low: 1, unknown: 0 };
      urgency += severityScores[damage.severity ?? "unknown"] ?? 0;
    }
  }

  // Privacy risk adds 1 point if high
  const privacyResult = results.detect_privacy_risk;
  if (privacyResult && privacyResult.status === "fulfilled") {
    const privacy = privacyResult.value as { risk_level?: string } | undefined;
    if (privacy?.risk_level === "high") {
      urgency += 1;
    }
  }

  // Location inconsistency adds 1 point
  const locationResult = results.assess_location_time_consistency;
  if (locationResult && locationResult.status === "fulfilled") {
    const location = locationResult.value as { is_consistent?: boolean } | undefined;
    if (location && !location.is_consistent) {
      urgency += 1;
    }
  }

  // Duplicates add 1 point
  const duplicatesResult = results.find_duplicates;
  if (duplicatesResult && duplicatesResult.status === "fulfilled") {
    const duplicates = duplicatesResult.value as { has_duplicates?: boolean } | undefined;
    if (duplicates?.has_duplicates) {
      urgency += 1;
    }
  }

  return Math.min(5, urgency);
}

interface ReportMeta {
  lng: number;
  lat: number;
  category_id: string;
  photo_urls: string[] | null;
  description: string;
  category_name: string;
  title: string | null;
}

async function loadReportMeta(env: Env, reportId: string): Promise<ReportMeta | null> {
  return await withClient(env, async (c) => {
    const result = await c.query<ReportMeta>(
      `SELECT ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat, r.category_id, r.photo_urls, r.description, c.name AS category_name, r.title
       FROM reports r
       JOIN categories c ON c.id = r.category_id
       WHERE r.id = $1`,
      [reportId]
    );
    return result.rows[0] ?? null;
  });
}

function buildInitialMessages(meta: ReportMeta): LLMChatMessage[] {
  const systemPrompt = `You are an AI assessment agent for infrastructure damage reports.

You have access to the following tools:
- assess_media_quality: Analyzes photo quality using vision AI
- classify_problem: Classifies the type and severity of infrastructure problems
- extract_damage_indicators: Extracts damage indicators from photos using vision AI

Each tool returns structured JSON with confidence scores and supporting/risk factors.

Your task is to assess infrastructure damage reports by calling the appropriate tools in sequence.
After each tool result, analyze what additional tools might be needed.
When you have gathered sufficient information, respond with a final summary.

Always respond with valid JSON or a text summary.`;

  const photoUrls = meta.photo_urls || [];
  const photoInfo = photoUrls.length > 0
    ? `Photos available: ${photoUrls.length} image(s)\nFirst photo: ${photoUrls[0]}`
    : "No photos available";

  const userPrompt = `Report Assessment Request:

Report ID: ${meta.category_id}
Category: ${meta.category_name}
Description: ${meta.description ?? "No description"}

${photoInfo}
Location: lat=${meta.lat}, lng=${meta.lng}

Please analyze this report and determine what actions to take.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

async function executeToolCall(
  env: Env,
  toolCall: { function: { name: string; arguments: string } },
  toolResults: Record<string, ToolResult>
): Promise<void> {
  const toolName = toolCall.function.name as ToolName;
  const tool = allTools[toolName];
  if (!tool) {
    toolResults[toolName] = {
      status: "rejected",
      error: `Unknown tool: ${toolName}`,
    };
    return;
  }

  let input: unknown;
  try {
    input = JSON.parse(toolCall.function.arguments);
  } catch {
    toolResults[toolName] = {
      status: "rejected",
      error: "Invalid JSON arguments",
    };
    return;
  }

  const timeoutMs = getToolTimeoutMs(env);
  const maxRetries = getMaxRetries(env);

  try {
    const executeFn = tool.execute as (env: Env, input: unknown) => Promise<unknown>;
    const result = await withRetry(
      () => withTimeout(executeFn(env, input), toolName, timeoutMs),
      maxRetries
    );
    toolResults[toolName] = { status: "fulfilled", value: result };
  } catch (e) {
    toolResults[toolName] = { status: "rejected", error: (e as Error).message };
  }
}

async function finalizeAssessment(
  env: Env,
  reportId: string,
  meta: ReportMeta,
  toolResults: Record<string, ToolResult>,
  finalText: string
): Promise<AssessmentSummary> {
  const photoUrls = meta.photo_urls || [];

  const results: Record<string, ToolResult> = { ...toolResults };
  let hasFailure = false;
  let hasSuccess = false;

  for (const [toolName, result] of Object.entries(results)) {
    if (result.status === "fulfilled") {
      hasSuccess = true;
      const idempotencyKey = `${toolName}_${reportId}_${crypto.randomUUID()}`;
      await saveAssessment(env, {
        tool_name: toolName,
        report_id: reportId,
        model_version: env.TEXT_MODEL_NAME ?? "MiniMax-M2.1",
        rule_version: "1.0.0",
        confidence: result.value !== undefined
          ? (result.value as { confidence?: number })?.confidence ?? 0.5
          : 0.5,
        supporting_factors: [],
        risk_factors: [],
        correlation_ids: [idempotencyKey],
        idempotency_key: idempotencyKey,
        status: "completed",
        result: result.value as Record<string, unknown>,
      }).catch((e) => logger.error({
        route: "/api/agent",
        method: "POST",
        context: "assessment_save_failed",
        tool: toolName,
        error: e instanceof Error ? e : new Error(String(e)),
      }));
    } else {
      hasFailure = true;
      await saveFailedAssessment(env, {
        report_id: reportId,
        tool_name: toolName,
        error: result.error ?? "Unknown error",
        failed_at: new Date(),
      }).catch((e) => logger.error({
        route: "/api/agent",
        method: "POST",
        context: "failed_assessment_save_failed",
        tool: toolName,
        error: e instanceof Error ? e : new Error(String(e)),
      }));
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

  await updateFacilityCard(env, reportId, facilityCard).catch((e) => {
    logger.error({ route: "/api/agent", method: "POST", error: e instanceof Error ? e : new Error(String(e)), context: "facility_card_update_failed" });
  });

  await updateAiRecommendedStatus(env, reportId, recommendedStatus).catch((e) => {
    logger.error({ route: "/api/agent", method: "POST", error: e instanceof Error ? e : new Error(String(e)), context: "ai_recommended_status_update_failed" });
  });

  consolidateReport(env, reportId).catch((e) => {
    logger.error({ route: "/api/agent", method: "POST", error: e instanceof Error ? e : new Error(String(e)), context: "facility_card_consolidation_failed" });
  });

  return {
    report_id: reportId,
    overall_status,
    tool_results: results,
  };
}

export async function runAssessment(env: Env, reportId: string): Promise<AssessmentSummary> {
  const meta = await loadReportMeta(env, reportId);
  if (!meta) {
    return { report_id: reportId, overall_status: "failed", tool_results: {} };
  }

  const messages = buildInitialMessages(meta);
  const tools = buildOpenAIToolDefinitions(allTools as unknown as Record<string, ToolDescriptor>);
  const maxIterations = getMaxIterations(env);
  const toolResults: Record<string, ToolResult> = {};

  for (let i = 0; i < maxIterations; i++) {
  const photoUrls = (meta.photo_urls || []);
    const toolChoice = (i === 0 && photoUrls.length > 0)
      ? { type: "function" as const, function: { name: "extract_damage_indicators" } }
      : "auto";

    const completion = await callLLMWithMessages(env, {
      messages,
      tools,
      toolChoice,
      temperature: 0,
    });

    // Execute tool_calls FIRST if present (even if finish_reason is "stop")
    if (completion.message.tool_calls && completion.message.tool_calls.length > 0) {
      const dispatchResults = await Promise.allSettled(
        completion.message.tool_calls.map((tc) => executeToolCall(env, tc, toolResults))
      );

      for (let j = 0; j < completion.message.tool_calls.length; j++) {
        const tc = completion.message.tool_calls[j];
        const result = dispatchResults[j];
        if (!tc || !result) continue;
        const content = result.status === "fulfilled"
          ? JSON.stringify(result.value)
          : `Error: ${result.reason?.message ?? "unknown"}`;
        messages.push({
          role: "function",
          name: tc.function.name,
          content,
        });
      }
      // Continue to next iteration to see if more tool calls are needed
      continue;
    }

    // No tool_calls - check if LLM is done
    if (completion.finish_reason === "stop") {
      return finalizeAssessment(env, reportId, meta, toolResults, completion.message.content ?? "Assessment complete");
    }
  }

  return finalizeAssessment(env, reportId, meta, toolResults, "Maximum iterations reached");
}

function photoKeyFromUrl(url: string): string {
  const match = url.match(/^reports\/[a-f0-9-]+\/[a-z0-9._-]+$/);
  if (!match) {
    throw new Error(`Invalid photo URL format: ${url}`);
  }
  return match[0];
}
