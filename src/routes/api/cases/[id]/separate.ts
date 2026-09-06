import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/id";
import { evaluatePriority } from "@/lib/priority/calculator";
import { VerifikatorSeparateSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";

export const casesSeparateRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesSeparateRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { new_case_description, reason } = await parseJson(
      c,
      VerifikatorSeparateSchema,
    );

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
            message: `Cannot separate a report in '${currentStatus}' state`,
          },
        },
        409,
      );
    }

    const newReportId = generateId();

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        `INSERT INTO reports (id, idempotency_key, category_id, description, geom, status, created_at, updated_at, photo_urls)
     SELECT lower(hex(randomblob(6))), lower(hex(randomblob(6))), category_id, ?1, geom, 'submitted', (datetime('now')), (datetime('now')), photo_urls FROM reports WHERE id = ?2`,
      ).bind(new_case_description, id),
    );
    statements.push(
      c.env.D1.prepare(
        "UPDATE reports SET status = 'separated', separated_into = ?1, updated_at = (datetime('now')) WHERE id = ?2",
      ).bind(newReportId, id),
    );

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const after = await c.env.D1.prepare(
      "SELECT id, status, separated_into FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string; status: string; separated_into: string }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "admin_separate",
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
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at) VALUES (lower(hex(randomblob(6))), ?1, 'status_change', 'Laporan Dipisahkan', ?2, ?3, datetime('now'))`,
        )
          .bind(notifRow.reporter_id, "Laporan telah dipisahkan.", id)
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
    return c.json({ status: "separated", new_case_id: newReportId });
  }),
);
