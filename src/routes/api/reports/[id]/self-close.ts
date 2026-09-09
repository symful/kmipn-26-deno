import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES, SELF_CLOSABLE_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { evaluatePriority } from "@/lib/priority/calculator";
import { z } from "zod";
import { ID_REGEX } from "@/lib/id";
import { parseJson } from "@/lib/validation";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { recordAdjudication, awardXp } from "@/lib/gamification";

const SelfCloseSchema = z.object({
  reason: z
    .string()
    .min(10, "Alasan penutupan minimal 10 karakter"),
});

export const selfCloseRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

selfCloseRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const reportId = c.req.param("id");

    if (!reportId || !ID_REGEX.test(reportId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "ID laporan tidak valid",
          },
        },
        400,
      );
    }

    const parsed = await parseJson(c, SelfCloseSchema);

    const reportR = await c.env.D1.prepare(
      "SELECT id, status, reporter_id FROM reports WHERE id = ?1",
    )
      .bind(reportId)
      .first<{ id: string; status: string; reporter_id: string }>();
    if (!reportR) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } },
        404,
      );
    }

    if (reportR.reporter_id !== user.sub) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Anda bukan pemilik laporan ini",
          },
        },
        403,
      );
    }

    const currentStatus = reportR.status;
    if (
      TERMINAL_STATES.includes(
        currentStatus as (typeof TERMINAL_STATES)[number],
      ) ||
      !SELF_CLOSABLE_STATES.includes(
        currentStatus as (typeof SELF_CLOSABLE_STATES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_STATE",
            message:
              "Laporan dalam status ini tidak dapat ditutup oleh pelapor",
          },
        },
        409,
      );
    }

    const activeTasksR = await c.env.D1.prepare(
      `SELECT id, assigned_to, status FROM tasks
       WHERE report_id = ?1
       AND status NOT IN ('completed', 'rejected')`,
    )
      .bind(reportId)
      .all<{ id: string; assigned_to: string | null; status: string }>();
    const activeTasks = activeTasksR.results ?? [];
    const cancelledCount = activeTasks.length;

    const statements: D1PreparedStatement[] = [];

    statements.push(
      c.env.D1.prepare(
        `UPDATE reports SET status = 'closed', updated_at = datetime('now') WHERE id = ?1`,
      ).bind(reportId),
    );

    for (const task of activeTasks) {
      statements.push(
        c.env.D1.prepare(
          `UPDATE tasks SET status = 'rejected', updated_at = datetime('now'),
           progress_notes = CASE
             WHEN progress_notes IS NULL OR progress_notes = '' THEN 'Ditutup oleh pelapor'
             ELSE progress_notes || ' — Ditutup oleh pelapor'
           END
           WHERE id = ?1`,
        ).bind(task.id),
      );
    }

    const eventId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    statements.push(
      c.env.D1.prepare(
        `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at, metadata)
         VALUES (?1, ?2, 'closed_by_reporter', ?3, datetime('now'), ?4)`,
      ).bind(
        eventId,
        reportId,
        user.sub,
        JSON.stringify({ reason: parsed.reason }),
      ),
    );

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "report_closed_by_reporter",
        objectType: "report",
        objectId: reportId,
        before: { status: reportR.status },
        after: { status: "closed", reason: parsed.reason },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          err: e,
        }),
      ),
    );

    try {
      await sendNotification(
        c.env,
        user.sub,
        "status_change",
        "Laporan Anda telah ditutup oleh Anda sendiri.",
        reportId,
        c.req.path,
        c.req.method,
        "Laporan Ditutup",
      );
    } catch (e) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e as Error,
        context: "notification_insert_failed",
      });
    }

    for (const task of activeTasks) {
      if (task.assigned_to) {
        try {
          await sendNotification(
            c.env,
            task.assigned_to,
            "status_change",
            `Laporan yang menugaskan Anda telah ditutup oleh pelapor. Alasan: ${parsed.reason}`,
            reportId,
            c.req.path,
            c.req.method,
            "Tugas Dibatalkan",
          );
        } catch (e) {
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e as Error,
            context: "notification_insert_failed",
          });
        }
      }
    }

    c.executionCtx.waitUntil(
      evaluatePriority(c.env, reportId).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "priority_calc_failed",
        }),
      ),
    );

    c.executionCtx.waitUntil(
      Promise.all([
        recordAdjudication(c.env, user.sub, reportId, true),
        awardXp(c.env, {
          userId: user.sub,
          contributionId: reportId,
          type: "self_status_changing_update",
          idempotencyKey: `xp:${reportId}:self_close`,
          reason: "Self-close XP",
        }),
      ]).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e instanceof Error ? e : new Error(String(e)),
          context: "gamification_hook_failed",
        }),
      ),
    );

    return c.json({ success: true, status: "closed", cancelled_tasks: cancelledCount }, 200);
  }),
);
