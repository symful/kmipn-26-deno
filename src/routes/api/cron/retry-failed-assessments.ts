import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
import { getConfig } from "@/config/env";

const MAX_RETRIES = 3;
const RETRY_WINDOW_HOURS = 1;

export interface RetryResult {
  id: string;
  report_id: string;
  tool_name: string;
  status: "recovered" | "retry_failed" | "permanent_dlq" | "skipped";
  error?: string | undefined;
}

export async function processFailedAssessments(
  env: Env,
  actor?: string,
  limit?: number,
): Promise<{ processed: RetryResult[] }> {
  const processed: RetryResult[] = [];

  await withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      const r = await client.query<{
        id: string;
        report_id: string;
        tool_name: string;
        retry_count: number;
        error: string;
      }>(
        `SELECT fa.id, fa.report_id, fa.tool_name, COALESCE(fa.retry_count, 0) as retry_count, fa.error
         FROM failed_assessments fa
         JOIN reports r ON r.id = fa.report_id
         WHERE fa.permanent_dlq = false
           AND (fa.retry_count IS NULL OR fa.retry_count < $1)
           AND (fa.next_retry_at IS NULL OR fa.next_retry_at <= NOW())
           AND fa.failed_at <= NOW() - INTERVAL '${RETRY_WINDOW_HOURS} hours'
         ORDER BY fa.failed_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [MAX_RETRIES, limit]
      );

      for (const row of r.rows) {
        const currentRetryCount = row.retry_count ?? 0;

        const { allTools } = await import("@/lib/agent/tools");
        const tool = allTools[row.tool_name as keyof typeof allTools];

        if (!tool) {
          await client.query(
            `UPDATE failed_assessments SET permanent_dlq = true, last_error = $1 WHERE id = $2`,
            [`Tool '${row.tool_name}' not found`, row.id]
          );
          processed.push({ id: row.id, report_id: row.report_id, tool_name: row.tool_name, status: "permanent_dlq", error: `Tool not found: ${row.tool_name}` });
          continue;
        }

        const reportR = await client.query(
          `SELECT r.id, r.category_id, ST_X(r.geom::geometry) AS lng, ST_Y(r.geom::geometry) AS lat,
                  r.photo_urls, r.description, c.name AS category_name, r.title
           FROM reports r
           JOIN categories c ON c.id = r.category_id
           WHERE r.id = $1`,
          [row.report_id]
        );

        if (!reportR.rows[0]) {
          await client.query(
            `UPDATE failed_assessments SET permanent_dlq = true, last_error = $1 WHERE id = $2`,
            [`Report not found: ${row.report_id}`, row.id]
          );
          processed.push({ id: row.id, report_id: row.report_id, tool_name: row.tool_name, status: "permanent_dlq", error: "Report not found" });
          continue;
        }

        const report = reportR.rows[0];
        const photoUrls = report.photo_urls ?? [];
        const firstPhotoUrl = photoUrls[0] ?? "";

        let toolInput: unknown;
        switch (row.tool_name) {
          case "assess_completeness":
            toolInput = { report_id: row.report_id };
            break;
          case "assess_media_quality":
            toolInput = {
              report_id: row.report_id,
              image_url: firstPhotoUrl,
              category_name: report.category_name ?? "",
              description: report.description ?? "",
            };
            break;
          case "assess_location_time_consistency":
            toolInput = { report_id: row.report_id, photo_key: photoUrls[0] ? photoUrls[0].replace(/^reports\/[a-f0-9-]+\//, "") : "" };
            break;
          case "classify_problem":
            toolInput = {
              report_id: row.report_id,
              description: report.description ?? "",
              category_name: report.category_name ?? "",
            };
            break;
          case "find_duplicates":
            toolInput = {
              report_id: row.report_id,
              lng: report.lng,
              lat: report.lat,
              category_id: report.category_id,
            };
            break;
          case "detect_privacy_risk":
            toolInput = {
              report_id: row.report_id,
              description: report.description ?? "",
              image_url: firstPhotoUrl,
            };
            break;
          case "extract_damage_indicators":
            toolInput = {
              report_id: row.report_id,
              image_url: firstPhotoUrl,
              category_name: report.category_name ?? "",
              description: report.description ?? "",
            };
            break;
          default:
            await client.query(
              `UPDATE failed_assessments SET permanent_dlq = true, last_error = $1 WHERE id = $2`,
              [`Tool '${row.tool_name}' retry not implemented`, row.id]
            );
            processed.push({ id: row.id, report_id: row.report_id, tool_name: row.tool_name, status: "permanent_dlq", error: `Tool not implemented: ${row.tool_name}` });
            continue;
        }

        let toolResult: { status: "fulfilled" | "rejected"; value?: unknown; error?: string };
        try {
          const execFn = tool.execute as (env: Env, input: unknown) => Promise<unknown>;
          const timeoutMs = 60000;
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout: ${row.tool_name} exceeded 60s`)), timeoutMs);
          });
          const result = await Promise.race([execFn(env, toolInput), timeoutPromise]);
          toolResult = { status: "fulfilled", value: result };
        } catch (e) {
          toolResult = { status: "rejected", error: (e as Error).message };
        }

        const newRetryCount = currentRetryCount + 1;

        if (toolResult.status === "fulfilled") {
          await client.query(`DELETE FROM failed_assessments WHERE id = $1`, [row.id]);

          const { saveAssessment } = await import("@/lib/agent/store");
          const idempotencyKey = `${row.tool_name}_${row.report_id}_cron_retry_${Date.now()}`;
          await saveAssessment(env, {
            tool_name: row.tool_name,
            report_id: row.report_id,
            model_version: env.TEXT_MODEL_NAME ?? "MiniMax-M2.1",
            rule_version: "1.0.0",
            confidence: (toolResult.value as { confidence?: number })?.confidence ?? 0.5,
            supporting_factors: [],
            risk_factors: [],
            correlation_ids: [idempotencyKey],
            idempotency_key: idempotencyKey,
            status: "completed",
            result: toolResult.value as Record<string, unknown>,
          });

          if (actor) {
            appendAudit(env, {
              actor,
              action: "failed_assessment_cron_recovered",
              objectType: "failed_assessment",
              objectId: row.id,
              after: { status: "recovered", retry_count: newRetryCount },
            }).catch((e) => {
              logger.error({ route: "/cron/retry-failed-assessments", method: "SCHEDULED", context: "audit_write_failed", error: e as Error });
            });
          }

          processed.push({ id: row.id, report_id: row.report_id, tool_name: row.tool_name, status: "recovered" });
        } else {
          const isPermanent = newRetryCount >= MAX_RETRIES;
          await client.query(
            `UPDATE failed_assessments
             SET retry_count = $1,
                 last_error = $2,
                 next_retry_at = $3,
                 permanent_dlq = $4
             WHERE id = $5`,
            [
              newRetryCount,
              toolResult.error ?? "Unknown error",
              isPermanent ? null : new Date(Date.now() + 3600000).toISOString(),
              isPermanent,
              row.id,
            ]
          );

          if (actor) {
            appendAudit(env, {
              actor,
              action: isPermanent ? "failed_assessment_cron_permanent_dlq" : "failed_assessment_cron_retry_failed",
              objectType: "failed_assessment",
              objectId: row.id,
              after: {
                status: isPermanent ? "permanent_dlq" : "retry_failed",
                retry_count: newRetryCount,
                error: toolResult.error,
              },
            }).catch((e) => {
              logger.error({ route: "/cron/retry-failed-assessments", method: "SCHEDULED", context: "audit_write_failed", error: e as Error });
            });
          }

          processed.push({
            id: row.id,
            report_id: row.report_id,
            tool_name: row.tool_name,
            status: isPermanent ? "permanent_dlq" : "retry_failed",
            error: toolResult.error,
          });
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ route: "/cron/retry-failed-assessments", method: "SCHEDULED", context: "process_failed_assessments_tx_error", error: err as Error });
      throw err;
    }
  });

  return { processed };
}

export const retryFailedAssessmentsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

retryFailedAssessmentsRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const actor = c.get("user").sub;
    const batchLimit = getConfig(c.env as unknown as Record<string, string | undefined>).FAILED_ASSESSMENTS_BATCH_LIMIT;
    const result = await processFailedAssessments(c.env, actor, batchLimit);
    return c.json(result);
  }),
);
