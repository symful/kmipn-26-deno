import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { VerifikatorVerifyCompletionSchema } from "@/lib/schemas";

const VERIFIABLE_STATUSES = ["under_review"] as const;

export const verifyCompletionRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

verifyCompletionRoute.post("/", requireAuth, requireRole("VERIFIKATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  const body = await c.req.json();
  const parsed = VerifikatorVerifyCompletionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const { decision, reason, completion_notes } = parsed.data;

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const beforeR = await client.query("SELECT id, status, reporter_id FROM reports WHERE id = $1", [id]);
      if (!beforeR.rows[0]) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      const currentStatus = beforeR.rows[0].status as string;
      if (!VERIFIABLE_STATUSES.includes(currentStatus as typeof VERIFIABLE_STATUSES[number])) {
        await client.query("COMMIT");
        return { notVerifiable: true, current: currentStatus };
      }

      const taskR = await client.query(
        `SELECT st.id, st.report_id, st.petugas_id
         FROM surveyor_tasks st
         WHERE st.report_id = $1 AND st.status = 'completed'
         ORDER BY st.completed_at DESC LIMIT 1`,
        [id]
      );
      if (!taskR.rows[0]) {
        await client.query("COMMIT");
        return { noCompletionFound: true };
      }

      let newStatus: string;
      if (decision === "approved") {
        newStatus = "resolved";
        await client.query(
          "UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2",
          [newStatus, id]
        );
        await client.query(
          `UPDATE surveyor_tasks SET verification_status = 'approved', verified_by = $1, verified_at = NOW() WHERE id = $2`,
          [user.sub, taskR.rows[0].id]
        );
      } else {
        newStatus = "needs_completion";
        await client.query(
          "UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2",
          [newStatus, id]
        );
        await client.query(
          `UPDATE surveyor_tasks SET status = 'in_progress', verification_status = 'rejected', verified_by = $1, verified_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [user.sub, taskR.rows[0].id]
        );
      }

      await client.query(
        `UPDATE task_completions SET verified = $1, verified_by = $2, verified_at = NOW()
         ${completion_notes ? ", notes = $3" : ""}
         WHERE task_id = $4`,
        [decision === "approved", user.sub, ...(completion_notes ? [completion_notes] : []), taskR.rows[0].id]
      );

      const afterR = await client.query("SELECT id, status FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return {
        before: beforeR.rows[0],
        after: afterR.rows[0],
        reporter_id: beforeR.rows[0].reporter_id,
        petugas_id: taskR.rows[0].petugas_id,
        task_id: taskR.rows[0].id,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (result?.notFound) {
    return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  }
  if (result?.noCompletionFound) {
    return c.json({ error: { code: "BAD_REQUEST", message: "No completion proof found for this report" } }, 400);
  }
  if (result?.notVerifiable) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot verify completion for a report in '${result.current}' state` } }, 409);
  }

  const auditAction = decision === "approved" ? "verifikator_completion_approved" : "verifikator_completion_rejected";
  await auditReportChange(c.env, user.sub, id, auditAction as "verifikator_completion_approved" | "verifikator_completion_rejected", result!.before, result!.after, reason);

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        [auditAction, JSON.stringify({ report_id: id, decision, reason, verified_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  if (result!.petugas_id) {
    try {
      await withClient(c.env, async (client) => {
        const notifKind = decision === "approved" ? "completion_approved" : "completion_rejected";
        const notifTitle = decision === "approved" ? "Pekerjaan Disetujui" : "Pekerjaan Perlu Diperbaiki";
        const notifBody = decision === "approved"
          ? "Bukti penyelesaian telah disetujui oleh Verifikator."
          : `Verifikator meminta perbaikan: ${reason}`;
        await client.query(
          `INSERT INTO notifications (user_id, kind, title, body, related_report_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [result!.petugas_id, notifKind, notifTitle, notifBody, id]
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
    task_id: result!.task_id,
  });
}));
