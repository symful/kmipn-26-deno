import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

const ASSIGNABLE_STATUSES = ["verified", "needs_survey"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const operatorAssignRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

operatorAssignRoute.post("/", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  if (!UUID_REGEX.test(id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Case ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const unitId = body.unit_id ? String(body.unit_id) : null;
  const instructions = body.instructions ? String(body.instructions) : null;
  const deadline = body.deadline ? new Date(String(body.deadline)) : null;

  if (unitId && !UUID_REGEX.test(unitId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "unit_id must be a valid UUID" } }, 400);
  }

  if (deadline && deadline <= new Date()) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "deadline must be a future date" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const beforeR = await client.query("SELECT id, status, assigned_to, deadline FROM reports WHERE id = $1", [id]);
      if (!beforeR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const currentStatus = beforeR.rows[0].status as string;
      if (!ASSIGNABLE_STATUSES.includes(currentStatus as typeof ASSIGNABLE_STATUSES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }

      const updateFields: string[] = ["status = 'assigned'", "updated_at = NOW()"];
      const updateParams: (string | null)[] = [];
      let paramIdx = 1;

      if (unitId) {
        updateFields.push(`assigned_to = $${paramIdx++}`);
        updateParams.push(unitId);
      }

      if (deadline) {
        updateFields.push(`deadline = $${paramIdx++}`);
        updateParams.push(deadline.toISOString());
      }

      updateParams.push(id);

      await client.query(
        `UPDATE reports SET ${updateFields.join(", ")} WHERE id = $${paramIdx}`,
        updateParams
      );

      if (instructions && unitId) {
        await client.query(
          `INSERT INTO task_instructions (report_id, unit_id, instructions, created_by) VALUES ($1, $2, $3, $4)`,
          [id, unitId, instructions, user.sub]
        );
      }

      const afterR = await client.query("SELECT id, status, assigned_to, deadline FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return { before: beforeR.rows[0], after: afterR.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot assign a case in '${result.current}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "report_assigned", result.before, result.after, instructions ?? "");

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        ["operator_assign", JSON.stringify({ report_id: id, action: "operator_assign", unit_id: unitId, instructions, deadline: deadline?.toISOString(), assigned_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  return c.json({ status: "assigned", assigned_to: result.after.assigned_to, deadline: result.after.deadline });
}));
