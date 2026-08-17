import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated"] as const;

export const closeRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

closeRoute.post(
  "/:id",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const before = await client.query("SELECT status FROM reports WHERE id = $1", [id]);
        if (!before.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const currentStatus = before.rows[0].status as string;
        if (TERMINAL_STATES.includes(currentStatus as typeof TERMINAL_STATES[number])) {
          await client.query("COMMIT");
          return { invalidTransition: true, current: currentStatus };
        }
        if (currentStatus !== "resolved") {
          await client.query("COMMIT");
          return { invalidTransition: true, current: currentStatus };
        }
        await client.query("UPDATE reports SET status = 'closed', updated_at = NOW() WHERE id = $1", [id]);
        const after = await client.query("SELECT status FROM reports WHERE id = $1", [id]);
        await client.query("COMMIT");
        return { before: before.rows[0], after: after.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });
    if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Report tidak ditemukan" } }, 404);
    if (result.invalidTransition) {
      return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot close a report in '${result.current}' state; only 'resolved' can be closed` } }, 409);
    }
    await auditReportChange(c.env, user.sub, id!, "report_closed", result.before, result.after);
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
           VALUES ($1, 'internal', $2, $3, NOW())`,
          ["report_closed", JSON.stringify({ report_id: id, action: "report_closed" }), id]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
    }
    try {
      const notifRow = await withClient(c.env, async (client) => {
        const r = await client.query(`SELECT reporter_id FROM reports WHERE id = $1`, [id]);
        return r.rows[0];
      });
      if (notifRow?.reporter_id) {
        await withClient(c.env, async (client) => {
          await client.query(
            `INSERT INTO notifications (user_id, kind, body, related_report_id) VALUES ($1, $2, $3, $4)`,
            [notifRow.reporter_id, "report_closed", "Laporan telah ditutup.", id]
          );
        });
      }
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
    c.executionCtx.waitUntil(
      evaluatePriority(c.env, id).catch((e) =>
        logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
      )
    );
    return c.json({ status: "closed", ...result.after });
  }),
);
