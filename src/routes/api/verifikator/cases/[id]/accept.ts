import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { getAssessments } from "@/lib/agent/store";
import { runAssessment } from "@/lib/agent/orchestrator";
import { evaluatePriority } from "@/lib/priority/calculator";

const ALLOWED_STATES = ["submitted", "under_review", "needs_survey"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const acceptRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

acceptRoute.post("/", requireAuth, requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {}
  const reason = String(body.reason ?? "");
  const assignedUnitId = body.assigned_unit_id ? String(body.assigned_unit_id) : null;
  if (assignedUnitId && !UUID_REGEX.test(assignedUnitId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "assigned_unit_id must be a valid UUID" } }, 400);
  }
  const deadline = body.deadline ? new Date(String(body.deadline)) : null;
  if (deadline && deadline <= new Date()) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "deadline must be a future date" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const before = await client.query("SELECT status, severity, assigned_to FROM reports WHERE id = $1", [id]);
      if (!before.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const currentStatus = before.rows[0].status as string;
      if (TERMINAL_STATES.includes(currentStatus as typeof TERMINAL_STATES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }
      if (!ALLOWED_STATES.includes(currentStatus as typeof ALLOWED_STATES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }
      await client.query(
        "UPDATE reports SET status = 'verified', severity = COALESCE($1, severity), assigned_to = $2, deadline = $3, verified_at = NOW(), updated_at = NOW() WHERE id = $4",
        [body.priority ?? null, assignedUnitId, deadline, id]
      );
      const after = await client.query("SELECT status, severity, assigned_to FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { before: before.rows[0], after: after.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot accept a report in '${result.current}' state` } }, 409);
  }

  try {
    await auditReportChange(c.env, user.sub, id, "verifikator_accept", result.before, result.after, reason);
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "audit_failed" });
  }
  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, $2, $3, $4)`,
        ["verifikator_accept", "satu_data", JSON.stringify({ report_id: id, action: "verifikator_accept", reason, accepted_by: user.sub }), id]
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
          [notifRow.reporter_id, "report_accepted", "Laporan Anda telah diterima dan diverifikasi.", id]
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

  c.executionCtx.waitUntil(
    runAssessment(c.env, id).catch((e) =>
      logger.error({ route: c.req.path, method: c.req.method, error: e, context: "ai_assessment_failed" })
    )
  );

  let assessments: Awaited<ReturnType<typeof getAssessments>> = [];
  try {
    assessments = await getAssessments(c.env, id);
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "assessments_fetch_failed" });
    assessments = [];
  }

  const afterStatus = result.after?.status ?? null;
  const afterSeverity = result.after?.severity ?? null;
  const afterAssignedTo = result.after?.assigned_to ?? null;

  return c.json({
    id,
    status: afterStatus,
    severity: afterSeverity,
    assigned_to: afterAssignedTo,
    assessments,
  });
}));
