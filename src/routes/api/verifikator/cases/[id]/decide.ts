import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorDecisionSchema } from "@/lib/schemas";
import { evaluatePriority } from "@/lib/priority/calculator";
import { runAssessment } from "@/lib/agent/orchestrator";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const decideRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

decideRoute.post("/:id/decide", requireAuth, requireRole("VERIFIKATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  const body = await c.req.json();
  const parsed = VerifikatorDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const { decision, reason, duplicate_of_report_id, surveyor_id, assigned_unit_id, deadline } = parsed.data;

  if (decision === "duplicate" && !duplicate_of_report_id) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "duplicate_of_report_id is required when decision is 'duplicate'" } }, 400);
  }
  if (decision === "needs_survey" && !surveyor_id) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "surveyor_id is required when decision is 'needs_survey'" } }, 400);
  }
  if (decision === "needs_survey" && surveyor_id && !UUID_REGEX.test(surveyor_id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "surveyor_id must be a valid UUID" } }, 400);
  }
  if (duplicate_of_report_id && !UUID_REGEX.test(duplicate_of_report_id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "duplicate_of_report_id must be a valid UUID" } }, 400);
  }
  if (assigned_unit_id && !UUID_REGEX.test(assigned_unit_id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "assigned_unit_id must be a valid UUID" } }, 400);
  }
  if (deadline) {
    const dl = new Date(deadline);
    if (dl <= new Date()) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "deadline must be a future date" } }, 400);
    }
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const beforeR = await client.query("SELECT id, status, reporter_id, merged_into FROM reports WHERE id = $1", [id]);
      if (!beforeR.rows[0]) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      const currentStatus = beforeR.rows[0].status as string;
      if (TERMINAL_STATES.includes(currentStatus as typeof TERMINAL_STATES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }

      const validFromStatuses = ["submitted", "under_review"];
      if (!validFromStatuses.includes(currentStatus)) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: currentStatus };
      }

      let newStatus: string;
      let primaryReportId: string | null = null;
      let surveyorTaskCreated = false;

      switch (decision) {
        case "valid": {
          newStatus = "verified";
          await client.query(
            `UPDATE reports SET status = $1, verified_at = NOW(), updated_at = NOW()
             ${assigned_unit_id ? ", assigned_to = $2" : ""}
             ${deadline ? ", deadline = $3" : ""}
             WHERE id = $4`,
            [newStatus, ...(assigned_unit_id ? [assigned_unit_id] : []), ...(deadline ? [deadline] : []), id]
          );
          break;
        }
        case "needs_completion": {
          newStatus = "needs_completion";
          await client.query(
            "UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2",
            [newStatus, id]
          );
          break;
        }
        case "needs_survey": {
          newStatus = "needs_survey";
          await client.query(
            `UPDATE reports SET status = $1, updated_at = NOW()
             ${deadline ? ", deadline = $2" : ""}
             WHERE id = $3`,
            [newStatus, ...(deadline ? [deadline] : []), id]
          );
          const taskDl = deadline ? new Date(deadline) : null;
          await client.query(
            `INSERT INTO surveyor_tasks (report_id, surveyor_id, status, deadline, created_at, updated_at)
             VALUES ($1, $2, 'assigned', $3, NOW(), NOW())`,
            [id, surveyor_id, taskDl]
          );
          surveyorTaskCreated = true;
          break;
        }
        case "duplicate": {
          newStatus = "duplicate_merged";
          primaryReportId = duplicate_of_report_id!;
          await client.query(
            "UPDATE reports SET status = $1, merged_into = $2, updated_at = NOW() WHERE id = $3",
            [newStatus, duplicate_of_report_id, id]
          );
          break;
        }
        case "out_of_scope": {
          newStatus = "out_of_scope";
          await client.query(
            "UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2",
            [newStatus, id]
          );
          break;
        }
        case "rejected": {
          newStatus = "rejected";
          await client.query(
            "UPDATE reports SET status = $1, rejection_reason = $2, updated_at = NOW() WHERE id = $3",
            [newStatus, reason, id]
          );
          break;
        }
        default:
          await client.query("ROLLBACK");
          return { invalidDecision: true };
      }

      const afterR = await client.query("SELECT id, status, merged_into, rejection_reason FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return {
        before: beforeR.rows[0],
        after: afterR.rows[0],
        newStatus,
        surveyorTaskCreated,
        primaryReportId,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (result?.notFound) {
    return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  }
  if (result?.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot decide on a report in '${result.current}' state` } }, 409);
  }
  if (result?.invalidDecision) {
    return c.json({ error: { code: "INVALID_DECISION", message: "Unknown decision type" } }, 400);
  }

  const actionMap: Record<string, string> = {
    valid: "verifikator_decide_valid",
    needs_completion: "verifikator_decide_needs_completion",
    needs_survey: "verifikator_decide_needs_survey",
    duplicate: "verifikator_decide_duplicate",
    out_of_scope: "verifikator_decide_out_of_scope",
    rejected: "verifikator_decide_rejected",
  };
  const auditAction = actionMap[decision] ?? "verifikator_decide";

  await auditReportChange(
    c.env,
    user.sub,
    id,
    auditAction as "verifikator_decide_valid" | "verifikator_decide_needs_completion" | "verifikator_decide_needs_survey" | "verifikator_decide_duplicate" | "verifikator_decide_out_of_scope" | "verifikator_decide_rejected",
    result!.before,
    result!.after,
    reason
  );

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        [auditAction, JSON.stringify({ report_id: id, decision, reason, decided_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  const reporterId = result!.before?.reporter_id as string | undefined;

  if (decision === "needs_completion" && reporterId) {
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
           VALUES ($1, 'needs_completion', 'Laporan Perlu Dilengkapi', 'Verifikator meminta Anda untuk melengkapi laporan.', $2)`,
          [reporterId, id]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
  }

  if (decision === "out_of_scope" && reporterId) {
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
           VALUES ($1, 'out_of_scope', 'Laporan Di Luar Cakupan', 'Laporan Anda berada di luar cakupan wilayah atau konteks ini.', $2)`,
          [reporterId, id]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
  }

  if (decision === "out_of_scope") {
    try {
      await withClient(c.env, async (client) => {
        const wilayahId = result!.before?.wilayah_id;
        const adminRows = await client.query(
          `SELECT id FROM users WHERE role = 'ADMIN_DAERAH' AND (wilayah_id = $1 OR wilayah_id IS NULL) LIMIT 1`,
          wilayahId ? [wilayahId] : []
        );
        for (const row of adminRows.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
             VALUES ($1, 'admin_alert', 'Laporan Out of Scope', 'Sebuah laporan telah ditandai di luar cakupan dan memerlukan tinjauan.', $2)`,
            [row.id, id]
          );
        }
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
  }

  if (decision === "needs_survey" && surveyor_id) {
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
           VALUES ($1, 'task_assigned', 'Tugas Survei Baru', 'Anda ditugaskan untuk survei laporan.', $2)`,
          [surveyor_id, id]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
  }

  if (decision === "valid") {
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
  }

  return c.json({
    status: result!.newStatus,
    decision,
    reason,
    ...(result!.primaryReportId ? { primary_report_id: result!.primaryReportId } : {}),
    ...(result!.surveyorTaskCreated ? { surveyor_task_created: true } : {}),
  });
}));
