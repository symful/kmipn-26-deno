import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { MarkReadSchema } from "@/lib/schemas";

export const markReadRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

markReadRoute.post(
  "/",
  safeHandler(async (c) => {
    const userId = c.get("user")?.sub;
    if (!userId) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401,
      );
    }

    const parsed = await parseJson(c, MarkReadSchema);
    const hasMarkAll = "mark_all" in parsed;

    if (hasMarkAll) {
      await c.env.D1.prepare(
        `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`,
      )
        .bind(userId)
        .run();
      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: userId,
          action: "notification_mark_read",
          objectType: "notification",
          objectId: "all",
          after: { mark_all: true },
        }).catch((e) =>
          logger.error({
            route: "/api/notifications/mark-read",
            method: "POST",
            context: "audit_write_failed",
            action: "notification_mark_read",
            error: e as Error,
          }),
        ),
      );
      return c.json({ success: true, updated: "all" });
    }

    const { id } = parsed as { id: string };

    const res = await c.env.D1.prepare(
      `SELECT id, user_id FROM notifications WHERE COALESCE(id, CAST(rowid AS TEXT)) = ?`,
    )
      .bind(id)
      .first<{ id: string; user_id: string | null }>();

    if (!res) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Notification not found" } },
        404,
      );
    }

    if (res.user_id !== null && res.user_id !== userId) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Cannot mark another user's notification",
          },
        },
        403,
      );
    }

    await c.env.D1.prepare(
      `UPDATE notifications SET read_at = datetime('now') WHERE COALESCE(id, CAST(rowid AS TEXT)) = ? AND (user_id IS NULL OR user_id = ?)`,
    )
      .bind(id, userId)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: userId,
        action: "notification_mark_read",
        objectType: "notification",
        objectId: id,
        after: { marked_read: true },
      }).catch((e) =>
        logger.error({
          route: "/api/notifications/mark-read",
          method: "POST",
          context: "audit_write_failed",
          action: "notification_mark_read",
          error: e as Error,
        }),
      ),
    );

    return c.json({ success: true, updated: 1 });
  }),
);
