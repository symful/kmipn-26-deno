import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorRejectSchema } from "@/lib/schemas";
import { evaluatePriority } from "@/lib/priority/calculator";

export const rejectRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

rejectRoute.post("/", requireAuth, requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = VerifikatorRejectSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "reason must be at least 10 chars" } }, 400);
  const reason = parsed.data.reason;

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const before = await client.query("SELECT id, status FROM reports WHERE id = $1", [id]);
      if (!before.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const currentStatus = before.rows[0].status as string;
      if (TERMINAL_STATES.includes(currentStatus as typeof TERMINAL_STATES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }
      await client.query(
        "UPDATE reports SET status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2",
        [reason, id]
      );
      const after = await client.query("SELECT id, status, rejection_reason FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { before: before.rows[0], after: after.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot reject a report in '${result.current}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "verifikator_reject", result.before, result.after, reason);
  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, $2, $3, $4)`,
        ["verifikator_reject", "satu_data", JSON.stringify({ report_id: id, action: "verifikator_reject", reason, rejected_by: user.sub }), id]
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
          [notifRow.reporter_id, "report_rejected", "Laporan Anda telah ditolak.", id]
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
  return c.json({ status: "rejected", reason });
}));
