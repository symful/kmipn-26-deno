import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const outboxRetryRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

outboxRetryRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ error: { code: "VALIDATION_ERROR", message: "id required" } }, 400);
    const user = c.get("user");

    const entry = await withClient(c.env, async (client) => {
      const r = await client.query(
        `SELECT id, status, retry_count FROM outbox WHERE id = $1`,
        [id]
      );
      return r.rows[0];
    });

    if (!entry) return c.json({ error: { code: "NOT_FOUND", message: "Outbox entry not found" } }, 404);

    if (entry.status === "dead_letter" && !["ADMIN", "ADMIN_DAERAH"].includes(user.role)) {
      return c.json({ error: { code: "FORBIDDEN", message: "Cannot retry a dead-letter entry; admin reset required" } }, 403);
    }

    const result = await withClient(c.env, async (client) => {
      await client.query(
        `UPDATE outbox
         SET status = 'pending',
             retry_count = retry_count + 1,
             last_attempt_at = NOW(),
             error_message = NULL
         WHERE id = $1`,
        [id]
      );
      const after = await client.query(
        `SELECT id, status, retry_count FROM outbox WHERE id = $1`,
        [id]
      );

      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: user.sub,
        action: "outbox_retry",
        objectType: "outbox",
        objectId: id,
        before: { status: entry.status, retry_count: entry.retry_count },
        after: { status: after.rows[0].status, retry_count: after.rows[0].retry_count },
      }).catch((e) => logger.error({ route: "/api/outbox", method: "POST", context: "audit_write_failed", action: "outbox_retry", error: e as Error }));

      return { before: entry, after: after.rows[0], retried_by: user.sub };
    });

    return c.json({ status: "pending", retry_count: result.after.retry_count });
  }),
);
