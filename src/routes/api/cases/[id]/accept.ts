import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { getAssessments } from "@/lib/agent/store";
import { evaluatePriority } from "@/lib/priority/calculator";
import { VerifikatorAcceptSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { recordAdjudication, awardXp } from "@/lib/gamification";

const ALLOWED_STATES = ["submitted", "under_review", "needs_survey"] as const;

export const casesAcceptRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesAcceptRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );
    const { reason, assigned_unit_id, deadline, priority } = await parseJson(
      c,
      VerifikatorAcceptSchema,
    );
    const assignedUnitId = assigned_unit_id ?? null;
    const effectiveDeadline = deadline ?? null;

    const before = await c.env.D1.prepare(
      "SELECT status, severity, assigned_to FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string; severity: string; assigned_to: string }>();
    if (!before) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        404,
      );
    }
    const currentStatus = before.status;
    if (
      TERMINAL_STATES.includes(
        currentStatus as (typeof TERMINAL_STATES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot accept a report in '${currentStatus}' state`,
          },
        },
        409,
      );
    }
    if (
      !ALLOWED_STATES.includes(currentStatus as (typeof ALLOWED_STATES)[number])
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot accept a report in '${currentStatus}' state`,
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        "UPDATE reports SET status = 'verified', severity = COALESCE(?1, severity), assigned_to = ?2, deadline = ?3, verified_at = (datetime('now')), updated_at = (datetime('now')) WHERE id = ?4",
      ).bind(priority ?? null, assignedUnitId, effectiveDeadline, id),
    );

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const after = await c.env.D1.prepare(
      "SELECT status, severity, assigned_to FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string; severity: string; assigned_to: string }>();

    try {
      const notifRow = await c.env.D1.prepare(
        `SELECT reporter_id FROM reports WHERE id = ?`,
      )
        .bind(id)
        .first<{ reporter_id: string }>();
      if (notifRow?.reporter_id) {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at) VALUES (lower(hex(randomblob(6))), ?1, 'status_change', 'Laporan Diterima', ?2, ?3, datetime('now'))`,
        )
          .bind(
            notifRow.reporter_id,
            "Laporan Anda telah diterima dan diverifikasi.",
            id,
          )
          .run();
      }
    } catch (e) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e as Error,
        context: "notification_insert_failed",
      });
    }

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "admin_accept",
        before,
        after ?? null,
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

    {
      const rpt = await c.env.D1.prepare(
        `SELECT reporter_id FROM reports WHERE id = ?`,
      )
        .bind(id)
        .first<{ reporter_id: string }>();
      if (rpt?.reporter_id) {
        c.executionCtx.waitUntil(
          Promise.all([
            recordAdjudication(c.env, rpt.reporter_id, id, true),
            awardXp(c.env, {
              userId: rpt.reporter_id,
              contributionId: id,
              type: "new_report",
              idempotencyKey: `xp:${id}:new_report`,
              reason: "Report accepted via accept",
            }),
          ]).catch((e) =>
            logger.error({
              route: c.req.path,
              method: c.req.method,
              error: e instanceof Error ? e : new Error(String(e)),
              context: "gamification_hook_failed",
            }),
          ),
        );
      }
    }

    let assessments: Awaited<ReturnType<typeof getAssessments>> = [];
    try {
      assessments = await getAssessments(c.env, id);
    } catch (e) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e as Error,
        context: "assessments_fetch_failed",
      });
      assessments = [];
    }

    const afterStatus = after?.status ?? null;
    const afterSeverity = after?.severity ?? null;
    const afterAssignedTo = after?.assigned_to ?? null;

    return c.json({
      id,
      status: afterStatus,
      severity: afterSeverity,
      assigned_to: afterAssignedTo,
      assessments,
    });
  }),
);
