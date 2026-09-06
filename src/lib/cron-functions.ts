/**
 * Cron utility functions extracted from deleted route files.
 * These functions are used by the scheduled handler.
 */
import type { Env } from "@/types/bindings";
import { logger } from "@/lib/logger";

const MAX_RETRIES = 5;

/**
 * Process failed assessments with retry logic.
 * Queries agent_assessments for rows with assessment_status = 'failed' (or 'timeout'/'parse_failed'/'vlm_error')
 * and retry_count < MAX_RETRIES, then marks them for retry or dead_letter.
 */
export async function processFailedAssessments(
  env: Env,
  _cursor?: unknown,
  _limit?: number,
): Promise<void> {
  const limit = typeof _limit === "number" && _limit > 0 ? _limit : 100;

  const r = await env.D1.prepare(
    `SELECT id, report_id, retry_count FROM agent_assessments
     WHERE assessment_status IN ('failed', 'timeout', 'parse_failed', 'vlm_error')
       AND (retry_count < ? OR retry_count IS NULL)
     ORDER BY created_at ASC
     LIMIT ?`,
  )
    .bind(MAX_RETRIES, limit)
    .all<{ id: string; report_id: string; retry_count: number | null }>();

  const statements: D1PreparedStatement[] = [];

  for (const row of r.results) {
    const retryCount = Number(row.retry_count ?? 0) + 1;

    if (retryCount >= MAX_RETRIES) {
      statements.push(
        env.D1.prepare(
          `UPDATE agent_assessments SET assessment_status = 'dead_letter', retry_count = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(retryCount, row.id),
      );
    } else {
      statements.push(
        env.D1.prepare(
          `UPDATE agent_assessments SET assessment_status = 'pending_retry', retry_count = ?, next_retry_at = datetime('now', '+1 hour'), updated_at = datetime('now') WHERE id = ?`,
        ).bind(retryCount, row.id),
      );
    }
  }

  if (statements.length > 0) {
    await env.D1.batch(statements);
  }

  logger.info({
    route: "/cron",
    method: "SCHEDULED",
    context: "processFailedAssessments",
    processed: statements.length,
  });
}

/**
 * Clean up revoked JWT tokens older than 7 days.
 */
export async function cleanupRevokedTokens(env: Env): Promise<void> {
  const result = await env.D1.prepare(
    `DELETE FROM revoked_tokens WHERE revoked_at < datetime('now', '-7 days')`,
  ).run();

  logger.info({
    route: "/cron",
    method: "SCHEDULED",
    context: "cleanupRevokedTokens",
    deleted: result.meta.changes ?? 0,
  });
}

/**
 * Clean up audit_log entries older than 90 days.
 */
export async function cleanupAuditLog(env: Env): Promise<void> {
  const result = await env.D1.prepare(
    `DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')`,
  ).run();

  logger.info({
    route: "/cron",
    method: "SCHEDULED",
    context: "cleanupAuditLog",
    deleted: result.meta.changes ?? 0,
  });
}

// D1PreparedStatement type (Cloudflare D1 batch accepts prepared statements)
type D1PreparedStatement = ReturnType<Env["D1"]["prepare"]>;
