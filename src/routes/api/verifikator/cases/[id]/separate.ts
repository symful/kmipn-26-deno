import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

export const separateRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

separateRoute.post("/", requireAuth, requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const newCaseDescription = String(body.new_case_description ?? "");
  const reason = String(body.reason ?? "");
  if (newCaseDescription.length < 10) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "new_case_description must be at least 10 characters" } }, 400);
  }

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
      const newR = await client.query<{ id: string }>(
        `INSERT INTO reports (idempotency_key, category_id, description, geom, status, created_at, updated_at, photo_urls)
         SELECT gen_random_uuid(), category_id, $1, geom, 'submitted', NOW(), NOW(), photo_urls FROM reports WHERE id = $2 RETURNING id`,
        [newCaseDescription, id]
      );
      await client.query(
        "UPDATE reports SET status = 'separated', separated_into = $1, updated_at = NOW() WHERE id = $2",
        [newR.rows[0]!.id, id]
      );
      const after = await client.query("SELECT id, status, separated_into FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { before: before.rows[0], after: after.rows[0], new_case_id: newR.rows[0]!.id };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot separate a report in '${result.current}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "verifikator_separate", result.before, result.after, reason);
  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, $2, $3, $4)`,
        ["verifikator_separate", "satu_data", JSON.stringify({ report_id: id, action: "verifikator_separate", new_case_id: result.new_case_id, reason, separated_by: user.sub }), id]
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
          [notifRow.reporter_id, "report_separated", "Laporan telah dipisahkan.", id]
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
  return c.json({ status: "separated", new_case_id: result.new_case_id });
}));
