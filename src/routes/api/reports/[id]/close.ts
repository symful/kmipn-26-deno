import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { auditReportChange } from "@/lib/audit-helpers";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated"] as const;

export const closeRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

closeRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const before = await c.env.D1.prepare(
      "SELECT status FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ status: string }>();
    if (!before)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report tidak ditemukan" } },
        404,
      );

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
            message: `Cannot close a report in '${currentStatus}' state; only 'resolved' can be closed`,
          },
        },
        409,
      );
    }
    if (currentStatus !== "resolved") {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot close a report in '${currentStatus}' state; only 'resolved' can be closed`,
          },
        },
        409,
      );
    }

    await c.env.D1.prepare(
      "UPDATE reports SET status = 'closed', updated_at = datetime('now') WHERE id = ?1",
    )
      .bind(id)
      .run();
    const after = await c.env.D1.prepare(
      "SELECT status FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ status: string }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id!,
        "report_closed",
        before,
        after,
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
        "SELECT reporter_id FROM reports WHERE id = ?1",
      )
        .bind(id)
        .first<{ reporter_id: string }>();
      if (notifRow?.reporter_id) {
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at)
           VALUES (lower(hex(randomblob(6))), ?1, 'status_change', 'Laporan Ditutup', 'Laporan Anda telah ditutup dan dianggap selesai.', ?2, datetime('now'))`,
        )
          .bind(notifRow.reporter_id, id)
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
    return c.json({ status: "closed", ...after });
  }),
);
