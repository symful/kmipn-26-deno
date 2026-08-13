import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorReviewSanggahanSchema } from "@/lib/schemas";

const APPEALABLE_STATES = ["rejected", "out_of_scope", "needs_completion"] as const;

export const reviewSanggahanRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

reviewSanggahanRoute.post("/:id/review-sanggahan", requireAuth, requireRole("VERIFIKATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  const body = await c.req.json();
  const parsed = VerifikatorReviewSanggahanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const { decision, reason } = parsed.data;

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const beforeR = await client.query("SELECT id, status, reporter_id FROM reports WHERE id = $1", [id]);
      if (!beforeR.rows[0]) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      const currentStatus = beforeR.rows[0].status as string;
      if (!APPEALABLE_STATES.includes(currentStatus as typeof APPEALABLE_STATES[number])) {
        await client.query("COMMIT");
        return { notAppealable: true, current: currentStatus };
      }

      const eventR = await client.query(
        `SELECT id FROM case_events WHERE report_id = $1 AND event_type = 'sanggahan_filed' ORDER BY occurred_at DESC LIMIT 1`,
        [id]
      );
      if (!eventR.rows[0]) {
        await client.query("COMMIT");
        return { noSanggahan: true };
      }

      let newStatus: string;
      if (decision === "accepted") {
        newStatus = "submitted";
        await client.query(
          "UPDATE reports SET status = $1, updated_at = NOW(), rejection_reason = NULL WHERE id = $2",
          [newStatus, id]
        );
        await client.query(
          `INSERT INTO case_events (report_id, event_type, actor_id, occurred_at)
           VALUES ($1, 'sanggahan_accepted', $2, NOW())`,
          [id, user.sub]
        );
      } else {
        newStatus = currentStatus;
        await client.query(
          `INSERT INTO case_events (report_id, event_type, actor_id, occurred_at)
           VALUES ($1, 'sanggahan_rejected', $2, NOW())`,
          [id, user.sub]
        );
      }

      const afterR = await client.query("SELECT id, status FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return {
        before: beforeR.rows[0],
        after: afterR.rows[0],
        reporter_id: beforeR.rows[0].reporter_id,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (result?.notFound) {
    return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  }
  if (result?.noSanggahan) {
    return c.json({ error: { code: "BAD_REQUEST", message: "No active objection found for this report" } }, 400);
  }
  if (result?.notAppealable) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot review objection for a report in '${result.current}' state` } }, 409);
  }

  const auditAction = decision === "accepted" ? "verifikator_sanggahan_accepted" : "verifikator_sanggahan_rejected";
  await auditReportChange(c.env, user.sub, id, auditAction as "verifikator_sanggahan_accepted" | "verifikator_sanggahan_rejected", result!.before, result!.after, reason);

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        [auditAction, JSON.stringify({ report_id: id, decision, reason, reviewed_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  if (result!.reporter_id) {
    try {
      await withClient(c.env, async (client) => {
        const notifKind = decision === "accepted" ? "sanggahan_accepted" : "sanggahan_rejected";
        const notifTitle = decision === "accepted" ? "Sanggahan Diterima" : "Sanggahan Ditolak";
        const notifBody = decision === "accepted"
          ? "Objeki Anda telah diterima. Laporan akan diproses ulang."
          : "Objeki Anda telah ditolak. Keputusan sebelumnya tetap berlaku.";
        await client.query(
          `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [result!.reporter_id, notifKind, notifTitle, notifBody, id]
        );
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "notification_insert_failed" });
    }
  }

  return c.json({
    decision,
    report_status: result!.after.status,
    reason,
  });
}));
