import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorRejectSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { evaluatePriority } from "@/lib/priority/calculator";
import { recordAdjudication } from "@/lib/gamification";

export const casesRejectRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesRejectRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { reason } = await parseJson(c, VerifikatorRejectSchema);

    const before = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string; status: string }>();
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
            message: `Cannot reject a report in '${currentStatus}' state`,
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        "UPDATE reports SET status = 'rejected', rejection_reason = ?1, updated_at = (datetime('now')) WHERE id = ?2",
      ).bind(reason, id),
    );

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const after = await c.env.D1.prepare(
      "SELECT id, status, rejection_reason FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string; status: string; rejection_reason: string }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "admin_reject",
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

    try {
      const notifRow = await c.env.D1.prepare(
        `SELECT reporter_id FROM reports WHERE id = ?`,
      )
        .bind(id)
        .first<{ reporter_id: string }>();
      if (notifRow?.reporter_id) {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at) VALUES (lower(hex(randomblob(6))), ?1, 'status_change', 'Laporan Ditolak', ?2, ?3, datetime('now'))`,
        )
          .bind(notifRow.reporter_id, "Laporan Anda telah ditolak.", id)
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
          recordAdjudication(c.env, rpt.reporter_id, id, false).catch((e) =>
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

    return c.json({ status: "rejected", reason });
  }),
);
