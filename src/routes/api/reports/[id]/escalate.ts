import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { auditReportChange } from "@/lib/audit-helpers";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";
import { sendNotification } from "@/lib/notifications";

export const escalateRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

escalateRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const before = await c.env.D1.prepare(
      "SELECT severity, status FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ severity: number; status: string }>();
    if (!before)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report tidak ditemukan" } },
        404,
      );

    const currentSeverity = (before.severity as number) ?? 0;
    if (currentSeverity >= 100) {
      return c.json({
        status: "escalated",
        severity: currentSeverity,
        message: "Report sudah berada di prioritas tertinggi",
      });
    }

    await c.env.D1.prepare(
      "UPDATE reports SET severity = 100, updated_at = datetime('now') WHERE id = ?1",
    )
      .bind(id)
      .run();
    const after = await c.env.D1.prepare(
      "SELECT severity, status FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ severity: number; status: string }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id!,
        "report_escalated",
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
        await sendNotification(
          c.env,
          notifRow.reporter_id,
          "report_escalated",
          "Laporan telah Diescalate ke prioritas tertinggi.",
          id,
          c.req.path,
          c.req.method,
        );
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
    return c.json({ status: "escalated", ...after });
  }),
);
