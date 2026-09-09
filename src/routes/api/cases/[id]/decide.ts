import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { CaseDecisionSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { generateId, ID_REGEX } from "@/lib/id";
import {
  evaluatePriority,
  getSlaDeadlineFromSeverity,
} from "@/lib/priority/calculator";
import { getConfig } from "@/config/env";
import { err } from "@/types/error-codes";
import { recordAdjudication, awardXp } from "@/lib/gamification";

export const casesDecideRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesDecideRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id) return c.json(err("MISSING_ID", "ID is required"), 400);

    const {
      decision,
      reason,
      duplicate_of_report_id,
      surveyor_id,
      assigned_unit_id,
      deadline,
      severity,
      task_type,
    } = await parseJson(c, CaseDecisionSchema);

    const effectiveAssignedUnitId = assigned_unit_id ?? undefined;
    const effectiveDeadline = deadline ?? undefined;

    if (decision === "duplicate" && !duplicate_of_report_id) {
      return c.json(
        err(
          "VALIDATION_ERROR",
          "duplicate_of_report_id is required when decision is 'duplicate'",
        ),
        400,
      );
    }
    if (decision === "needs_survey" && !surveyor_id && !assigned_unit_id) {
      return c.json(
        err(
          "VALIDATION_ERROR",
          "Pilih petugas atau unit penanggung jawab untuk survei",
        ),
        400,
      );
    }
    if (decision === "needs_survey" && assigned_unit_id) {
      const unit = await c.env.D1.prepare(
        "SELECT id FROM units WHERE id = ? AND is_active = 1",
      )
        .bind(assigned_unit_id)
        .first();
      if (!unit)
        return c.json(
          err(
            "VALIDATION_ERROR",
            "Unit penanggung jawab tidak ditemukan atau tidak aktif",
          ),
          400,
        );
    }
    if (decision === "needs_survey" && surveyor_id) {
      const worker = await c.env.D1.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'PETUGAS' AND deleted_at IS NULL AND disabled = 0",
      )
        .bind(surveyor_id)
        .first();
      if (!worker)
        return c.json(
          err("VALIDATION_ERROR", "Petugas tidak ditemukan atau tidak aktif"),
          400,
        );
    }
    if (duplicate_of_report_id && !ID_REGEX.test(duplicate_of_report_id)) {
      return c.json(
        err(
          "VALIDATION_ERROR",
          "duplicate_of_report_id must be a valid report id",
        ),
        400,
      );
    }

    const beforeR = await c.env.D1.prepare(
      "SELECT id, status, reporter_id, merged_into, category_id, severity FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{
        id: string;
        status: string;
        reporter_id: string;
        merged_into: string;
        category_id: string;
        severity: number | null;
      }>();
    if (!beforeR) {
      return c.json(err("NOT_FOUND", "Report not found"), 404);
    }
    const currentStatus = beforeR.status;
    if (
      TERMINAL_STATES.includes(
        currentStatus as (typeof TERMINAL_STATES)[number],
      )
    ) {
      return c.json(
        err(
          "INVALID_TRANSITION",
          `Cannot decide on a report in '${currentStatus}' state`,
        ),
        409,
      );
    }
    const validFromStatuses = ["submitted", "under_review", "verified"];
    if (!validFromStatuses.includes(currentStatus)) {
      return c.json(
        err(
          "INVALID_TRANSITION",
          `Cannot decide on a report in '${currentStatus}' state`,
        ),
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    let surveyorTaskCreated = false;

    const defaultSeverity = getConfig(
      c.env as unknown as Record<string, string | undefined>,
    ).DEFAULT_SEVERITY;
    const effectiveSeverity = severity ?? beforeR.severity ?? defaultSeverity;
    let slaDeadline: Date | null = null;
    if (decision === "valid" || decision === "needs_survey") {
      if (!effectiveDeadline && beforeR.category_id) {
        slaDeadline = await getSlaDeadlineFromSeverity(
          c.env,
          beforeR.category_id,
          effectiveSeverity,
          168,
        );
      }
    }

    switch (decision) {
      case "valid": {
        const deadlineToUse =
          effectiveDeadline ?? (slaDeadline ? slaDeadline.toISOString() : null);
        const severityUpdate =
          severity !== undefined ? `, severity = ${severity}` : "";
        if (effectiveAssignedUnitId && deadlineToUse) {
          statements.push(
            c.env.D1.prepare(
              `UPDATE reports SET status = 'verified', verified_at = (datetime('now')), updated_at = (datetime('now')), assigned_to = ?1, deadline = ?2${severityUpdate} WHERE id = ?3`,
            ).bind(effectiveAssignedUnitId, deadlineToUse, id),
          );
        } else if (effectiveAssignedUnitId) {
          statements.push(
            c.env.D1.prepare(
              `UPDATE reports SET status = 'verified', verified_at = (datetime('now')), updated_at = (datetime('now')), assigned_to = ?1${severityUpdate} WHERE id = ?2`,
            ).bind(effectiveAssignedUnitId, id),
          );
        } else if (deadlineToUse) {
          statements.push(
            c.env.D1.prepare(
              `UPDATE reports SET status = 'verified', verified_at = (datetime('now')), updated_at = (datetime('now')), deadline = ?1${severityUpdate} WHERE id = ?2`,
            ).bind(deadlineToUse, id),
          );
        } else {
          statements.push(
            c.env.D1.prepare(
              `UPDATE reports SET status = 'verified', verified_at = (datetime('now')), updated_at = (datetime('now'))${severityUpdate} WHERE id = ?1`,
            ).bind(id),
          );
        }
        break;
      }
      case "needs_completion": {
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'needs_completion', updated_at = (datetime('now')) WHERE id = ?1",
          ).bind(id),
        );
        break;
      }
      case "needs_clarification": {
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'pending_clarification', updated_at = (datetime('now')) WHERE id = ?1",
          ).bind(id),
        );
        break;
      }
      case "needs_survey": {
        const deadlineToUse =
          effectiveDeadline ?? (slaDeadline ? slaDeadline.toISOString() : null);
        const taskDl = deadlineToUse ? new Date(deadlineToUse) : null;
        const taskId = generateId();
        const severityUpdate =
          severity !== undefined ? `, severity = ${severity}` : "";
        if (deadlineToUse) {
          statements.push(
            c.env.D1.prepare(
              `UPDATE reports SET status = 'needs_survey', updated_at = (datetime('now')), deadline = ?1${severityUpdate} WHERE id = ?2`,
            ).bind(deadlineToUse, id),
          );
        } else {
          statements.push(
            c.env.D1.prepare(
              `UPDATE reports SET status = 'needs_survey', updated_at = (datetime('now'))${severityUpdate} WHERE id = ?1`,
            ).bind(id),
          );
        }
        statements.push(
          c.env.D1.prepare(
            `INSERT INTO tasks (id, report_id, assigned_to, status, deadline, unit_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'assigned', ?4, ?5, (datetime('now')), (datetime('now')))`,
          ).bind(
            taskId,
            id,
            surveyor_id ?? null,
            taskDl?.toISOString() ?? null,
            assigned_unit_id ?? null,
          ),
        );
        statements.push(
          c.env.D1.prepare(
            "INSERT INTO task_metadata (task_id, task_type) VALUES (?, ?)",
          ).bind(taskId, task_type ?? "survei_verifikasi"),
        );
        surveyorTaskCreated = true;
        break;
      }
      case "duplicate": {
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'duplicate_merged', merged_into = ?1, updated_at = (datetime('now')) WHERE id = ?2",
          ).bind(duplicate_of_report_id!, id),
        );
        break;
      }
      case "out_of_scope": {
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'out_of_scope', updated_at = (datetime('now')) WHERE id = ?1",
          ).bind(id),
        );
        break;
      }
      case "rejected": {
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'rejected', rejection_reason = ?1, updated_at = (datetime('now')) WHERE id = ?2",
          ).bind(reason, id),
        );
        break;
      }
    }

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const afterR = await c.env.D1.prepare(
      "SELECT id, status, merged_into, rejection_reason FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{
        id: string;
        status: string;
        merged_into: string;
        rejection_reason: string;
      }>();

    const actionMap: Record<string, string> = {
      valid: "admin_decide_valid",
      needs_completion: "admin_decide_needs_completion",
      needs_survey: "admin_decide_needs_survey",
      duplicate: "admin_decide_duplicate",
      out_of_scope: "admin_decide_out_of_scope",
      rejected: "admin_decide_rejected",
    };
    const auditAction = actionMap[decision] ?? "admin_decide";

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        auditAction as
          | "admin_decide_valid"
          | "admin_decide_needs_completion"
          | "admin_decide_needs_survey"
          | "admin_decide_duplicate"
          | "admin_decide_out_of_scope"
          | "admin_decide_rejected",
        beforeR,
        afterR ?? null,
        reason,
      ).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_failed",
        }),
      ),
    );

    const reporterId = beforeR.reporter_id as string | undefined;

    if (decision === "needs_completion" && reporterId) {
      try {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
         VALUES (lower(hex(randomblob(16))), ?1, 'needs_completion', 'Laporan Perlu Dilengkapi', 'Verifikator meminta Anda untuk melengkapi laporan.', ?2)`,
        )
          .bind(reporterId, id)
          .run();
      } catch (e) {
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e as Error,
          context: "notification_insert_failed",
        });
      }
    }

    if (decision === "out_of_scope" && reporterId) {
      try {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
         VALUES (lower(hex(randomblob(16))), ?1, 'out_of_scope', 'Laporan Di Luar Cakupan', 'Laporan Anda berada di luar cakupan wilayah atau konteks ini.', ?2)`,
        )
          .bind(reporterId, id)
          .run();
      } catch (e) {
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e as Error,
          context: "notification_insert_failed",
        });
      }
    }

    if (decision === "needs_survey" && surveyor_id) {
      try {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
         VALUES (lower(hex(randomblob(16))), ?1, 'task_assigned', 'Tugas Survei Baru', 'Anda ditugaskan untuk survei laporan.', ?2)`,
        )
          .bind(surveyor_id, id)
          .run();
      } catch (e) {
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e as Error,
          context: "notification_insert_failed",
        });
      }
    }

    if (
      (decision === "valid" ||
        decision === "needs_survey" ||
        decision === "needs_completion") &&
      reporterId
    ) {
      try {
        const titleMap: Record<string, string> = {
          valid: "Laporan Diverifikasi",
          needs_survey: "Laporan Memerlukan Survei",
          needs_completion: "Laporan Perlu Dilengkapi",
        };
        const bodyMap: Record<string, string> = {
          valid: "Laporan Anda telah diverifikasi dan akan ditindaklanjuti.",
          needs_survey:
            "Laporan Anda telah ditinjau dan memerlukan survei lapangan.",
          needs_completion:
            "Verifikator meminta Anda untuk melengkapi laporan.",
        };
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
         VALUES (lower(hex(randomblob(16))), ?1, 'status_change', ?2, ?3, ?4)`,
        )
          .bind(reporterId, titleMap[decision], bodyMap[decision], id)
          .run();
      } catch (e) {
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e as Error,
          context: "notification_insert_failed",
        });
      }
    }

    if (decision === "valid") {
      c.executionCtx.waitUntil(
        evaluatePriority(c.env, id).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e,
            context: "priority_calc_failed",
          }),
        ),
      );
    }

    if (reporterId) {
      c.executionCtx.waitUntil(
        (decision === "valid"
          ? Promise.all([
              recordAdjudication(c.env, reporterId, id, true),
              awardXp(c.env, {
                userId: reporterId,
                contributionId: id,
                type: "new_report",
                idempotencyKey: `xp:${id}:new_report`,
                reason: "Report accepted via decide",
              }),
            ])
          : decision === "duplicate" || decision === "rejected"
            ? recordAdjudication(c.env, reporterId, id, false)
            : Promise.resolve()
        ).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e instanceof Error ? e : new Error(String(e)),
            context: "gamification_hook_failed",
          }),
        ),
      );
    }

    return c.json({
      status: afterR?.status,
      decision,
      reason,
      ...(afterR?.merged_into ? { primary_report_id: afterR.merged_into } : {}),
      ...(surveyorTaskCreated ? { surveyor_task_created: true } : {}),
    });
  }),
);
