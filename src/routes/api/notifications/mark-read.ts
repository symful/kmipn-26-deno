import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const markReadRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

markReadRoute.post(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const userId = c.get("user")?.sub;
    if (!userId) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    }

    const body = await c.req.json();
    const { id, mark_all } = body as { id?: string; mark_all?: boolean };

    if (mark_all === true) {
      await withClient(c.env, async (client) => {
        await client.query(
          `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
          [userId]
        );
      });
      appendAudit(c.env, { activeRole: c.get("user").role,
        actor: userId,
        action: "notification_mark_read",
        objectType: "notification",
        objectId: "all",
        after: { mark_all: true },
      }).catch((e) => logger.error({ route: "/api/notifications/mark-read", method: "POST", context: "audit_write_failed", action: "notification_mark_read", error: e as Error }));
      return c.json({ success: true, updated: "all" });
    }

    if (!id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "id is required when mark_all is not true" } }, 400);
    }

    if (!UUID_REGEX.test(id)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" } }, 400);
    }

    const result = await withClient(c.env, async (client) => {
      const res = await client.query(
        `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id`,
        [id, userId]
      );
      return res.rowCount;
    });

    appendAudit(c.env, { activeRole: c.get("user").role,
      actor: userId,
      action: "notification_mark_read",
      objectType: "notification",
      objectId: id,
      after: { marked_read: true },
    }).catch((e) => logger.error({ route: "/api/notifications/mark-read", method: "POST", context: "audit_write_failed", action: "notification_mark_read", error: e as Error }));

    return c.json({ success: true, updated: result });
  }),
);
