import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const notificationsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

notificationsRoute.get(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const userId = c.get("user")?.sub;
    if (!userId) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    }

    const result = await withClient(c.env, async (client) => {
      const entriesR = await client.query(
        `SELECT id, user_id, kind, title, body, related_report_id, read_at, created_at
         FROM notifications
         WHERE user_id = $1 OR user_id IS NULL
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );
      return {
        entries: entriesR.rows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          related_report_id: row.related_report_id,
          read_at: row.read_at,
          created_at: row.created_at,
        })),
      };
    });

    appendAudit(c.env, {
      actor: userId,
      action: "notification_read",
      objectType: "notification",
      objectId: "list",
    }).catch((e) => logger.error({ route: "/api/notifications", method: "GET", context: "audit_write_failed", action: "notification_read", error: e as Error }));

    return c.json({ entries: result.entries });
  }),
);
