import { Hono } from "hono";
import { sendNotification } from "@/lib/notifications";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { prepareAuditStatement } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorVerifyCompletionSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import type { D1PreparedStatement } from "@cloudflare/workers-types";

const VERIFIABLE_STATUSES = ["under_review"] as const;

export const casesVerifyCompletionRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesVerifyCompletionRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );

    const { decision, reason, completion_notes } = await parseJson(
      c,
      VerifikatorVerifyCompletionSchema,
    );

    const beforeR = await c.env.D1.prepare(
      "SELECT id, status, reporter_id FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; status: string; reporter_id: string }>();
    if (!beforeR) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }
    const currentStatus = beforeR.status;
    if (
      !VERIFIABLE_STATUSES.includes(
        currentStatus as (typeof VERIFIABLE_STATUSES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot verify completion for a report in '${currentStatus}' state`,
          },
        },
        409,
      );
    }

    const taskR = await c.env.D1.prepare(
      `SELECT st.id, st.report_id, st.worker_id
     FROM tasks st
     WHERE st.report_id = ?1 AND st.status = 'completed'
     ORDER BY st.completed_at DESC LIMIT 1`,
    )
      .bind(id)
      .first<{ id: string; report_id: string; worker_id: string }>();
    if (!taskR) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "No completion proof found for this report",
          },
        },
        400,
      );
    }

    const statements: D1PreparedStatement[] = [];

    let newStatus: string;
    if (decision === "approved") {
      newStatus = "resolved";
      statements.push(
        c.env.D1.prepare(
          "UPDATE reports SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        ).bind(newStatus, id),
      );
      statements.push(
        c.env.D1.prepare(
          `UPDATE tasks SET verification_status = 'verified', verified_by = ?1, verified_at = datetime('now') WHERE id = ?2`,
        ).bind(user.sub, taskR.id),
      );
    } else {
      newStatus = "needs_completion";
      statements.push(
        c.env.D1.prepare(
          "UPDATE reports SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        ).bind(newStatus, id),
      );
      statements.push(
        c.env.D1.prepare(
          `UPDATE tasks SET status = 'in_progress', verification_status = 'rejected', verified_by = ?1, verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?2`,
        ).bind(user.sub, taskR.id),
      );
    }

    // No-op: `task_completions` table was dropped in schema rewrite (T6).
    // Completion verification now tracked via tasks.verification_status.

    statements.push(
      prepareAuditStatement(c.env, {
        actor: user.sub,
        actorRole: user.role,
        action:
          decision === "approved"
            ? "admin_completion_approved"
            : "admin_completion_rejected",
        objectType: "report",
        objectId: id,
        before: beforeR,
        after: {
          id,
          status: newStatus,
          completion_notes: completion_notes ?? null,
        },
        reason,
      }),
    );
    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const afterR = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; status: string }>();

    const result = {
      before: beforeR,
      after: afterR,
      reporter_id: beforeR.reporter_id,
      worker_id: taskR.worker_id,
      task_id: taskR.id,
    };

    if (result.reporter_id) {
      await sendNotification(
        c.env,
        result.reporter_id,
        decision === "approved" ? "report_resolved" : "needs_completion",
        decision === "approved"
          ? "Penanganan laporan Anda telah selesai dan diverifikasi."
          : "Penanganan laporan Anda masih memerlukan perbaikan.",
        id,
        c.req.path,
        c.req.method,
        decision === "approved" ? "Laporan Selesai" : "Penanganan Dilanjutkan",
      );
    }
    if (result.worker_id) {
      try {
        const notifKind =
          decision === "approved"
            ? "completion_approved"
            : "completion_rejected";
        const notifTitle =
          decision === "approved"
            ? "Pekerjaan Disetujui"
            : "Pekerjaan Perlu Diperbaiki";
        const notifBody =
          decision === "approved"
            ? "Bukti penyelesaian telah disetujui oleh Verifikator."
            : `Verifikator meminta perbaikan: ${reason}`;
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5)`,
        )
          .bind(result.worker_id, notifKind, notifTitle, notifBody, id)
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

    const afterReport = await c.env.D1.prepare(
      `SELECT id, local_id, category_id, reporter_id,
    description, impact, lat, lng, photo_urls, status, created_at, idempotency_key, updated_at,
    address_area, impact_dampak, severity, merged_into, separated_into, rejection_reason,
    deadline, verified_at, population_affected, vulnerability_index, ai_recommended_status,
    reported_at, title, facility_card_id, facility_card, device_id, assigned_to, geom, priority
    FROM reports WHERE id = ?1`,
    )
      .bind(id)
      .first();

    return c.json({
      decision,
      report_status: result.after?.status ?? null,
      reason,
      completion_notes: completion_notes ?? null,
      task_id: result.task_id,
      report: afterReport ?? null,
    });
  }),
);
