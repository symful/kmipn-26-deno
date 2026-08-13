import type { Env } from "@/types/bindings";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function sendNotification(
  env: Env,
  userId: string,
  kind: string,
  message: string,
  relatedReportId?: string,
  route?: string,
  method?: string,
): Promise<void> {
  try {
    await withClient(env, async (client) => {
      await client.query(
        `INSERT INTO notifications (user_id, type, message, related_report_id) VALUES ($1, $2, $3, $4)`,
        [userId, kind, message, relatedReportId ?? null]
      );
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error({
      route: route ?? "unknown",
      method: method ?? "unknown",
      context: "notification_insert_failed",
      userId,
      kind,
      relatedReportId,
      error: err,
    });
  }
}
