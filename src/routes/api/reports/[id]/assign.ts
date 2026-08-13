import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";
import { sendNotification } from "@/lib/notifications";

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const assignRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

assignRoute.post(
  "/:id",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json();
    const assigneeType = body.assignee_type ?? "user";
    if (assigneeType !== "unit" && assigneeType !== "user") {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "assignee_type must be 'unit' or 'user'" } }, 400);
    }
    const assignedUnitId = body.assigned_unit_id;
    if (!assignedUnitId || typeof assignedUnitId !== "string") {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "assigned_unit_id is required" } }, 400);
    }
    if (!UUID_REGEX.test(assignedUnitId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "assigned_unit_id must be a valid UUID" } }, 400);
    }
    logger.info({ route: c.req.path, method: c.req.method, message: `Assigning report ${id} to ${assigneeType} with ID ${assignedUnitId}` });
    const deadline = body.deadline ? new Date(String(body.deadline)) : null;
    if (deadline && deadline <= new Date()) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "deadline must be a future date" } }, 400);
    }
    const wilayahId = body.wilayah_id ? String(body.wilayah_id) : null;
    if (wilayahId && !UUID_REGEX.test(wilayahId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "wilayah_id must be a valid UUID" } }, 400);
    }

    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const before = await client.query("SELECT status, assigned_to, deadline FROM reports WHERE id = $1", [id]);
        if (!before.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const currentStatus = before.rows[0].status as string;
        if (TERMINAL_STATES.includes(currentStatus as typeof TERMINAL_STATES[number])) {
          await client.query("COMMIT");
          return { invalidTransition: true, current: currentStatus };
        }
        if (currentStatus !== "verified") {
          await client.query("COMMIT");
          return { invalidTransition: true, current: currentStatus };
        }
        await client.query(
          "UPDATE reports SET status = 'assigned', assigned_to = $1, deadline = $2, wilayah_id = $3, updated_at = NOW() WHERE id = $4",
          [assignedUnitId, deadline, wilayahId, id]
        );
        await client.query(
          "INSERT INTO surveyor_tasks (report_id, surveyor_id, status, deadline, created_at, updated_at) VALUES ($1, $2, 'assigned', $3, NOW(), NOW())",
          [id, assignedUnitId, deadline]
        );
        const after = await client.query("SELECT status, assigned_to, deadline FROM reports WHERE id = $1", [id]);
        await client.query("COMMIT");
        return { before: before.rows[0], after: after.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });
    if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Report tidak ditemukan" } }, 404);
    if (result.invalidTransition) {
      return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot assign a report in '${result.current}' state; only 'verified' can be assigned` } }, 409);
    }
    await auditReportChange(c.env, user.sub, id!, "report_assigned", result.before, result.after);
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
           VALUES ($1, 'internal', $2, $3, NOW())`,
          ["report_assigned", JSON.stringify({ report_id: id, action: "report_assigned", assigned_to: result.after.assigned_to }), id]
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
        await sendNotification(c.env, notifRow.reporter_id, "report_assigned", "Laporan telah ditugaskan ke petugas.", id, c.req.path, c.req.method);
      }
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
    c.executionCtx.waitUntil(
      evaluatePriority(c.env, id).catch((e) =>
        logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
      )
    );
    return c.json({ status: "assigned", ...result.after });
  }),
);
