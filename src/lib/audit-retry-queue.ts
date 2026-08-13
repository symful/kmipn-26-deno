/**
 * Audit retry queue for consent record inserts.
 * UU PDP requires auditable consent — these must not silently fail.
 * Failed inserts are queued in PostgreSQL and retried on the next request.
 */

import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";
import { logger } from "@/lib/logger";

export interface QueuedConsentRecord {
  user_id: string;
  device_id: string | null;
  purpose: string;
  ip: string | null;
  user_agent: string | null;
}

/**
 * Enqueue a failed consent record for retry.
 * Stores in PostgreSQL so it survives across isolates (Workers).
 */
export async function enqueueConsentRetry(env: Env, record: QueuedConsentRecord): Promise<void> {
  await withClient(env, async (client) => {
    await client.query(
      `INSERT INTO consent_retry_queue (user_id, device_id, purpose, ip, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [record.user_id, record.device_id, record.purpose, record.ip, record.user_agent]
    );
  }).catch((e) => {
    logger.error({
      route: "consent-retry-queue",
      method: "enqueue",
      error: e as Error,
      context: "consent_retry_enqueue_failed",
      user_id: record.user_id,
      purpose: record.purpose,
    });
  });
}

/**
 * Drain all pending consent records from the retry queue and insert them.
 * Deletes each record after successful insert.
 * Called on each request that might have pending retries.
 */
export async function drainConsentRetryQueue(env: Env): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  await withClient(env, async (client) => {
    // Fetch pending records
    const fetchResult = await client.query<{
      id: string;
      user_id: string;
      device_id: string | null;
      purpose: string;
      ip: string | null;
      user_agent: string | null;
    }>(
      `SELECT id, user_id, device_id, purpose, ip, user_agent
       FROM consent_retry_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 100`
    );

    for (const row of fetchResult.rows) {
      try {
        await client.query(
          `INSERT INTO consent_records (user_id, device_id, purpose, granted_at, ip, user_agent)
           VALUES ($1, $2, $3, NOW(), $4, $5)
           ON CONFLICT DO NOTHING`,
          [row.user_id, row.device_id, row.purpose, row.ip, row.user_agent]
        );

        // Mark as processed
        await client.query(
          `UPDATE consent_retry_queue SET status = 'processed', processed_at = NOW() WHERE id = $1`,
          [row.id]
        );
        processed++;
      } catch (e) {
        // Increment attempt count, mark as failed if too many attempts
        await client.query(
          `UPDATE consent_retry_queue
           SET attempt_count = attempt_count + 1,
               last_error = $2,
               status = CASE WHEN attempt_count + 1 >= 3 THEN 'dead_letter' ELSE status END
           WHERE id = $1`,
          [row.id, (e as Error).message]
        );
        failed++;
        logger.error({
          route: "consent-retry-queue",
          method: "drain",
          error: e as Error,
          context: "consent_retry_insert_failed",
          queue_id: row.id,
          user_id: row.user_id,
        });
      }
    }
  }).catch((e) => {
    logger.error({
      route: "consent-retry-queue",
      method: "drain",
      error: e as Error,
      context: "consent_retry_queue_drain_failed",
    });
  });

  return { processed, failed };
}
