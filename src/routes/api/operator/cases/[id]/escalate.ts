import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

const ESCALATABLE_STATUSES = ["verified", "assigned", "in_progress"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const operatorEscalateRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

operatorEscalateRoute.post("/", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  if (!UUID_REGEX.test(id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Case ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const reason = String(body.reason ?? "");

  if (reason.length < 5) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "reason must be at least 5 characters" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const beforeR = await client.query("SELECT id, status, severity FROM reports WHERE id = $1", [id]);
      if (!beforeR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const currentStatus = beforeR.rows[0].status as string;
      if (!ESCALATABLE_STATUSES.includes(currentStatus as typeof ESCALATABLE_STATUSES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }

      const newSeverity = beforeR.rows[0].severity as string;
      const severityOrder = ["low", "medium", "high", "critical"];
      const currentIdx = severityOrder.indexOf(newSeverity);
      const escalatedSeverity = currentIdx < severityOrder.length - 1 ? severityOrder[currentIdx + 1] : newSeverity;

      await client.query(
        "UPDATE reports SET status = 'escalated', severity = $1, updated_at = NOW() WHERE id = $2",
        [escalatedSeverity, id]
      );

      await client.query(
        `INSERT INTO escalations (report_id, escalated_by, reason, previous_severity, new_severity, escalated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, user.sub, reason, newSeverity, escalatedSeverity]
      );

      const afterR = await client.query("SELECT id, status, severity FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return { before: beforeR.rows[0], after: afterR.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot escalate a case in '${result.current}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "report_escalated", result.before, result.after, reason);

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        ["operator_escalate", JSON.stringify({ report_id: id, action: "operator_escalate", reason, escalated_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  c.executionCtx.waitUntil(
    evaluatePriority(c.env, id).catch((e) =>
      logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
    )
  );

  return c.json({ status: "escalated", severity: result.after.severity });
}));
