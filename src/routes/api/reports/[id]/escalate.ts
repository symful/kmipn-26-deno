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

export const escalateRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

escalateRoute.post(
  "/:id",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const before = await client.query("SELECT severity, status FROM reports WHERE id = $1", [id]);
        if (!before.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const currentSeverity = (before.rows[0].severity as number) ?? 0;
        // Only escalate if not already at max priority
        if (currentSeverity >= 100) {
          await client.query("COMMIT");
          return { alreadyEscalated: true, severity: currentSeverity };
        }
        await client.query("UPDATE reports SET severity = 100, updated_at = NOW() WHERE id = $1", [id]);
        const after = await client.query("SELECT severity, status FROM reports WHERE id = $1", [id]);
        await client.query("COMMIT");
        return { before: before.rows[0], after: after.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });
    if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Report tidak ditemukan" } }, 404);
    if (result.alreadyEscalated) {
      return c.json({ status: "escalated", severity: result.severity, message: "Report sudah berada di prioritas tertinggi" });
    }
    await auditReportChange(c.env, user.sub, id!, "report_escalated", result.before, result.after);
    try {
      await withClient(c.env, async (client) => {
        await client.query(
          `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
           VALUES ($1, 'internal', $2, $3, NOW())`,
          ["report_escalated", JSON.stringify({ report_id: id, action: "report_escalated" }), id]
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
        await sendNotification(c.env, notifRow.reporter_id, "report_escalated", "Laporan telah Diescalate ke prioritas tertinggi.", id, c.req.path, c.req.method);
      }
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
    c.executionCtx.waitUntil(
      evaluatePriority(c.env, id).catch((e) =>
        logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
      )
    );
    return c.json({ status: "escalated", ...result.after });
  }),
);
