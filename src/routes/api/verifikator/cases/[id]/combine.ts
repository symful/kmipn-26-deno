import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated", "resolved"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const combineRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

combineRoute.post("/:id", requireAuth, requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const targetCaseId = String(body.target_case_id ?? "");
  const reason = String(body.reason ?? "");
  if (!targetCaseId || targetCaseId === id) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);
  }
  if (!UUID_REGEX.test(targetCaseId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "target_case_id must be a valid UUID" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const before = await client.query("SELECT id, status, merged_into FROM reports WHERE id = $1", [id]);
      if (!before.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      const targetRes = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM reports WHERE id = $1",
        [targetCaseId]
      );
      if (!targetRes.rows[0]) {
        await client.query("COMMIT");
        return { targetNotFound: true };
      }
      if (TERMINAL_STATES.includes(targetRes.rows[0].status as typeof TERMINAL_STATES[number])) {
        await client.query("COMMIT");
        return { targetTerminal: true, targetStatus: targetRes.rows[0].status };
      }

      await client.query(
        "UPDATE reports SET status = 'merged', merged_into = $1, updated_at = NOW() WHERE id = $2",
        [targetCaseId, id]
      );
      const after = await client.query("SELECT id, status, merged_into FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { before: before.rows[0], after: after.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
  if (result.targetNotFound) {
    return c.json({ error: { code: "NOT_FOUND", message: "Target case not found" } }, 404);
  }
  if (result.targetTerminal) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot merge into a report in '${result.targetStatus}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "verifikator_combine", result.before, result.after, reason);
  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, $2, $3, $4)`,
        ["verifikator_combine", "satu_data", JSON.stringify({ report_id: id, action: "verifikator_combine", target_case_id: targetCaseId, reason, merged_by: user.sub }), id]
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
          `INSERT INTO notifications (user_id, type, message, related_report_id) VALUES ($1, $2, $3, $4)`,
          [notifRow.reporter_id, "report_combined", "Laporan telah digabungkan dengan laporan lain.", id]
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
  return c.json({ status: "merged", target_case_id: targetCaseId });
}));
