import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";
import { VerifikatorCombineSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { ID_REGEX } from "@/lib/id";

export const casesCombineRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesCombineRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { target_case_id, reason } = await parseJson(
      c,
      VerifikatorCombineSchema,
    );
    if (target_case_id === id) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        },
        400,
      );
    }
    if (!ID_REGEX.test(target_case_id)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "target_case_id must be a valid ID",
          },
        },
        400,
      );
    }
    const targetCaseId = target_case_id;

    const before = await c.env.D1.prepare(
      "SELECT id, status, merged_into FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; status: string; merged_into: string | null }>();
    if (!before) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        404,
      );
    }

    const targetRes = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?1",
    )
      .bind(targetCaseId)
      .first<{ id: string; status: string }>();
    if (!targetRes) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Target case not found" } },
        404,
      );
    }
    if (
      TERMINAL_STATES.includes(
        targetRes.status as (typeof TERMINAL_STATES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot merge into a report in '${targetRes.status}' state`,
          },
        },
        409,
      );
    }

    await c.env.D1.prepare(
      "UPDATE reports SET status = 'merged', merged_into = ?1, updated_at = datetime('now') WHERE id = ?2",
    )
      .bind(targetCaseId, id)
      .run();

    const after = await c.env.D1.prepare(
      "SELECT id, status, merged_into FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; status: string; merged_into: string | null }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "admin_combine",
        before,
        after,
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
        `SELECT reporter_id FROM reports WHERE id = ?1`,
      )
        .bind(id)
        .first<{ reporter_id: string }>();
      if (notifRow?.reporter_id) {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at) VALUES (lower(hex(randomblob(6))), ?1, 'status_change', 'Laporan Digabungkan', ?2, ?3, datetime('now'))`,
        )
          .bind(
            notifRow.reporter_id,
            "Laporan telah digabungkan dengan laporan lain.",
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
      evaluatePriority(c.env, id).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "priority_calc_failed",
        }),
      ),
    );
    return c.json({ status: "merged", target_case_id: targetCaseId });
  }),
);
