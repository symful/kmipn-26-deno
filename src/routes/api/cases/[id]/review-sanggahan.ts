import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { APPEALABLE_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorReviewSanggahanSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";

export const casesReviewSanggahanRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesReviewSanggahanRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );

    const { decision, reason } = await parseJson(
      c,
      VerifikatorReviewSanggahanSchema,
    );

    const beforeR = await c.env.D1.prepare(
      "SELECT id, status, reporter_id, appeal_status FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string; status: string; reporter_id: string; appeal_status: string | null }>();
    if (!beforeR) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }
    const currentStatus = beforeR.status;
    if (
      beforeR.appeal_status !== "pending" ||
      !APPEALABLE_STATES.includes(
        currentStatus as (typeof APPEALABLE_STATES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot review objection for a report in '${currentStatus}' state`,
          },
        },
        409,
      );
    }

    const eventR = await c.env.D1.prepare(
      `SELECT id FROM case_events WHERE report_id = ? AND event_type = 'sanggahan_filed' ORDER BY occurred_at DESC LIMIT 1`,
    )
      .bind(id)
      .first();
    if (!eventR) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "No active objection found for this report",
          },
        },
        400,
      );
    }

    const statements: D1PreparedStatement[] = [];
    if (decision === "accepted") {
      statements.push(
        c.env.D1.prepare(
          "UPDATE reports SET status = ?1, appeal_status = 'accepted', updated_at = (datetime('now')), rejection_reason = NULL WHERE id = ?2",
        ).bind("submitted", id),
      );
      statements.push(
        c.env.D1.prepare(
          `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at)
       VALUES (lower(hex(randomblob(16))), ?1, 'sanggahan_accepted', ?2, (datetime('now')))`,
        ).bind(id, user.sub),
      );
    } else {
      statements.push(
        c.env.D1.prepare(
          "UPDATE reports SET appeal_status = 'rejected', updated_at = (datetime('now')) WHERE id = ?1",
        ).bind(id),
      );
      statements.push(
        c.env.D1.prepare(
          `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at)
       VALUES (lower(hex(randomblob(16))), ?1, 'sanggahan_rejected', ?2, (datetime('now')))`,
        ).bind(id, user.sub),
      );
    }

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const afterR = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string; status: string }>();

    const auditAction =
      decision === "accepted"
        ? "admin_sanggahan_accepted"
        : "admin_sanggahan_rejected";

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        auditAction as "admin_sanggahan_accepted" | "admin_sanggahan_rejected",
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

    if (beforeR.reporter_id) {
      try {
        const notifKind =
          decision === "accepted" ? "sanggahan_accepted" : "sanggahan_rejected";
        const notifTitle =
          decision === "accepted" ? "Sanggahan Diterima" : "Sanggahan Ditolak";
        const notifBody =
          decision === "accepted"
            ? "Objeki Anda telah diterima. Laporan akan diproses ulang."
            : "Objeki Anda telah ditolak. Keputusan sebelumnya tetap berlaku.";
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)`,
        )
          .bind(beforeR.reporter_id, notifKind, notifTitle, notifBody, id)
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

    return c.json({
      decision,
      report_status: afterR?.status ?? null,
      reason,
    });
  }),
);
