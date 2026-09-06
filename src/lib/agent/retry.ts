import type { Env } from "@/types/bindings";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
import { saveAssessment } from "@/lib/agent/store";

const MAX_RETRIES = 3;

export interface RetryResult {
  id: string;
  status: "retried" | "failed";
  assessment_id?: string;
  error?: string;
}

export async function retrySingleAssessment(
  env: Env,
  failedAssessmentId: string,
  userSub: string,
  userRole: string,
): Promise<RetryResult> {
  const record = await env.D1.prepare(
    `SELECT fa.id, fa.report_id, fa.tool_name, fa.retry_count, fa.permanent_dlq, fa.last_error
     FROM failed_assessments fa WHERE fa.id = ?`,
  )
    .bind(failedAssessmentId)
    .first<{
      id: string;
      report_id: string;
      tool_name: string;
      retry_count: number;
      permanent_dlq: boolean;
      last_error: string | null;
    }>();

  if (!record) {
    return {
      id: failedAssessmentId,
      status: "failed",
      error: "Failed assessment not found",
    };
  }

  if (record.permanent_dlq) {
    return {
      id: failedAssessmentId,
      status: "failed",
      error: "Cannot retry a permanent DLQ entry",
    };
  }

  const currentRetryCount = record.retry_count ?? 0;
  if (currentRetryCount >= MAX_RETRIES) {
    await env.D1.prepare(
      `UPDATE failed_assessments SET permanent_dlq = true, last_error = ? WHERE id = ?`,
    )
      .bind(`Max retries (${MAX_RETRIES}) exceeded`, failedAssessmentId)
      .run();
    return {
      id: failedAssessmentId,
      status: "failed",
      error: `Max retries (${MAX_RETRIES}) exceeded`,
    };
  }

  const { allTools } = await import("@/lib/agent/tools");
  const tool = allTools[record.tool_name as keyof typeof allTools];

  if (!tool) {
    return {
      id: failedAssessmentId,
      status: "failed",
      error: `Tool '${record.tool_name}' not found`,
    };
  }

  const reportR = await env.D1.prepare(
    `SELECT r.id, r.category_id, CAST(json_extract(r.geom, '$.coordinates[0]') AS REAL) AS lng, CAST(json_extract(r.geom, '$.coordinates[1]') AS REAL) AS lat,
            r.photo_urls, r.description, c.name AS category_name, r.title
     FROM reports r
     JOIN categories c ON c.id = r.category_id
     WHERE r.id = ?`,
  )
    .bind(record.report_id)
    .first<{
      id: string;
      category_id: string;
      lng: number;
      lat: number;
      photo_urls: string[] | null;
      description: string | null;
      category_name: string | null;
      title: string | null;
    }>();

  if (!reportR) {
    return {
      id: failedAssessmentId,
      status: "failed",
      error: "Associated report not found",
    };
  }

  const report = reportR;
  const photoUrls = report.photo_urls ?? [];
  const firstPhotoUrl = photoUrls[0] ?? "";

  let toolInput: unknown;
  switch (record.tool_name) {
    case "assess_completeness":
      toolInput = { report_id: record.report_id };
      break;
    case "assess_media_quality":
      toolInput = {
        report_id: record.report_id,
        image_url: firstPhotoUrl,
        category_name: report.category_name ?? "",
        description: report.description ?? "",
      };
      break;
    case "assess_location_time_consistency":
      toolInput = {
        report_id: record.report_id,
        photo_key: photoUrls[0]
          ? photoUrls[0].replace(/^reports\/[a-f0-9-]+\//, "")
          : "",
      };
      break;
    case "classify_problem":
      toolInput = {
        report_id: record.report_id,
        description: report.description ?? "",
        category_name: report.category_name ?? "",
      };
      break;
    case "find_duplicates":
      toolInput = {
        report_id: record.report_id,
        lng: report.lng,
        lat: report.lat,
        category_id: report.category_id,
      };
      break;
    case "detect_privacy_risk":
      toolInput = {
        report_id: record.report_id,
        description: report.description ?? "",
        image_url: firstPhotoUrl,
      };
      break;
    case "extract_damage_indicators":
      toolInput = {
        report_id: record.report_id,
        image_url: firstPhotoUrl,
        category_name: report.category_name ?? "",
        description: report.description ?? "",
      };
      break;
    default:
      toolInput = {
        report_id: record.report_id,
        image_url: firstPhotoUrl,
        category_name: report.category_name ?? "",
        description: report.description ?? "",
      };
  }

  let toolResult: {
    status: "fulfilled" | "rejected";
    value?: unknown;
    error?: string;
  };
  try {
    const execFn = tool.execute as (
      env: Env,
      input: unknown,
    ) => Promise<unknown>;
    const timeoutMs = 60000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Timeout: ${record.tool_name} exceeded 60s`)),
        timeoutMs,
      );
    });
    const execResult = await Promise.race([
      execFn(env, toolInput),
      timeoutPromise,
    ]);
    toolResult = { status: "fulfilled", value: execResult };
  } catch (e) {
    toolResult = { status: "rejected", error: (e as Error).message };
  }

  const newRetryCount = currentRetryCount + 1;

  if (toolResult.status === "fulfilled") {
    await env.D1.prepare(`DELETE FROM failed_assessments WHERE id = ?`)
      .bind(failedAssessmentId)
      .run();

    const idempotencyKey = `${record.tool_name}_${record.report_id}_retry_${Date.now()}`;
    await saveAssessment(env, {
      tool_name: record.tool_name,
      report_id: record.report_id,
      model_version: env.TEXT_MODEL_NAME ?? "MiniMax-M2.1",
      rule_version: "1.0.0",
      confidence:
        (toolResult.value as { confidence?: number })?.confidence ?? 0.5,
      supporting_factors: [],
      risk_factors: [],
      correlation_ids: [idempotencyKey],
      idempotency_key: idempotencyKey,
      status: "completed",
      result: toolResult.value as Record<string, unknown>,
    });

    await appendAudit(env, {
      activeRole: userRole,
      actor: userSub,
      action: "failed_assessment_retry_success",
      objectType: "failed_assessment",
      objectId: failedAssessmentId,
      after: { status: "recovered", retry_count: newRetryCount },
    }).catch((e) =>
      logger.error({
        route: "/api/admin/failed-assessments/retry-batch",
        method: "POST",
        context: "audit_write_failed",
        error: e,
      }),
    );

    return {
      id: failedAssessmentId,
      status: "retried",
      assessment_id: idempotencyKey,
    };
  } else {
    const isPermanent = newRetryCount >= MAX_RETRIES;
    await env.D1.prepare(
      `UPDATE failed_assessments SET retry_count = ?, last_error = ?, next_retry_at = ?, permanent_dlq = ? WHERE id = ?`,
    )
      .bind(
        newRetryCount,
        toolResult.error ?? "Unknown error",
        isPermanent ? null : new Date(Date.now() + 3600000).toISOString(),
        isPermanent,
        failedAssessmentId,
      )
      .run();

    await appendAudit(env, {
      activeRole: userRole,
      actor: userSub,
      action: "failed_assessment_retry_failed",
      objectType: "failed_assessment",
      objectId: failedAssessmentId,
      after: {
        status: isPermanent ? "permanent_dlq" : "retry_failed",
        retry_count: newRetryCount,
        error: toolResult.error,
      },
    }).catch((e) =>
      logger.error({
        route: "/api/admin/failed-assessments/retry-batch",
        method: "POST",
        context: "audit_write_failed",
        error: e,
      }),
    );

    return {
      id: failedAssessmentId,
      status: "failed",
      error: toolResult.error ?? "Unknown error",
    };
  }
}
