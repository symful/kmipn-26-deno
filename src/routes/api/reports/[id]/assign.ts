import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { auditReportChange } from "@/lib/audit-helpers";
import { logger } from "@/lib/logger";
import {
  evaluatePriority,
  getSlaDeadlineFromSeverity,
} from "@/lib/priority/calculator";
import { getConfig } from "@/config/env";
import { sendNotification } from "@/lib/notifications";
import { generateId, UUID_REGEX } from "@/lib/id";
import { z } from "zod";
import { dbId } from "@/lib/schemas";

const assignRequestSchema = z.object({
  task_type: z
    .enum(["survei_verifikasi", "perbaikan_fisik"])
    .default("perbaikan_fisik"),
  assignee_type: z.enum(["unit", "user"]).default("user"),
  assigned_unit_id: dbId,
  deadline: z.string().datetime({ offset: true }).optional(),
  instructions: z.string().max(2000).optional(),
  reason: z.string().max(1000).optional(),
});

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated"] as const;

export const assignRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

assignRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const parsed = assignRequestSchema.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          },
        },
        400,
      );
    const body = parsed.data;
    const taskType = body.task_type ?? "perbaikan_fisik";
    if (!["survei_verifikasi", "perbaikan_fisik"].includes(taskType))
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Jenis tugas tidak valid",
          },
        },
        400,
      );
    const assigneeType = body.assignee_type ?? "user";
    if (assigneeType !== "unit" && assigneeType !== "user") {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "assignee_type must be 'unit' or 'user'",
          },
        },
        400,
      );
    }
    const assigneeId = body.assigned_unit_id;
    if (!assigneeId || typeof assigneeId !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "assigned_unit_id is required",
          },
        },
        400,
      );
    }
    logger.info({
      route: c.req.path,
      method: c.req.method,
      message: `Assigning report ${id} to ${assigneeType} with ID ${assigneeId}`,
    });
    const deadline = body.deadline ? new Date(String(body.deadline)) : null;
    if (deadline && deadline <= new Date()) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "deadline must be a future date",
          },
        },
        400,
      );
    }
    const before = await c.env.D1.prepare(
      "SELECT status, assigned_to, deadline, category_id, severity, reporter_id FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{
        status: string;
        assigned_to: string;
        deadline: string;
        category_id: string;
        severity: number | null;
        reporter_id: string | null;
      }>();
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
            message: `Cannot assign a report in '${currentStatus}' state; only 'verified' can be assigned`,
          },
        },
        409,
      );
    }
    const allowedStatuses =
      taskType === "survei_verifikasi"
        ? [
            "submitted",
            "under_review",
            "verified",
            "needs_survey",
            "needs_completion",
          ]
        : ["verified"];
    if (!allowedStatuses.includes(currentStatus)) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot assign a report in '${currentStatus}' state; only 'verified' can be assigned`,
          },
        },
        409,
      );
    }

    let effectiveDeadline: Date | null = deadline;
    if (!effectiveDeadline && before.category_id) {
      const defaultSeverity = getConfig(
        c.env as unknown as Record<string, string | undefined>,
      ).DEFAULT_SEVERITY;
      effectiveDeadline = await getSlaDeadlineFromSeverity(
        c.env,
        before.category_id,
        before.severity ?? defaultSeverity,
        168,
      );
    }

    let surveyor_id: string | null = null;
    let petugas_id: string | null = null;
    let unit_id: string | null = null;

    if (assigneeType === "user") {
      const userRow = await c.env.D1.prepare(
        "SELECT id, role FROM users WHERE id = ?1 AND deleted_at IS NULL",
      )
        .bind(assigneeId)
        .first<{ id: string; role: string }>();
      if (!userRow || userRow.role !== "PETUGAS") {
        return c.json(
          {
            error: {
              code: "ASSIGNEE_NOT_FOUND",
              message: `User ${assigneeId} not found`,
            },
          },
          422,
        );
      }
      surveyor_id = assigneeId;
      if (userRow.role === "PETUGAS") {
        petugas_id = assigneeId;
      }
    } else {
      // assigneeType === "unit"
      const unitRow = await c.env.D1.prepare(
        "SELECT id, created_by FROM units WHERE id = ?1 AND is_active = 1",
      )
        .bind(assigneeId)
        .first<{ id: string; created_by: string | null }>();
      if (!unitRow) {
        return c.json(
          {
            error: {
              code: "ASSIGNEE_NOT_FOUND",
              message: `Unit ${assigneeId} not found`,
            },
          },
          422,
        );
      }
      unit_id = assigneeId;
    }

    await c.env.D1.prepare(
      "UPDATE reports SET status = ?1, assigned_to = ?2, deadline = ?3, updated_at = datetime('now') WHERE id = ?4",
    )
      .bind(
        taskType === "survei_verifikasi" ? "needs_survey" : "assigned",
        surveyor_id,
        effectiveDeadline?.toISOString() ?? null,
        id,
      )
      .run();

    // Build task insert that includes unit_id where applicable
    const taskId = generateId();
    await c.env.D1.prepare(
      `INSERT INTO tasks (id, report_id, assigned_to, worker_id, unit_id, status, deadline, instructions, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'assigned', ?6, ?7, datetime('now'), datetime('now'))`,
    )
      .bind(
        taskId,
        id,
        surveyor_id,
        petugas_id,
        unit_id,
        effectiveDeadline?.toISOString() ?? null,
        body.instructions ?? body.reason ?? null,
      )
      .run();
    await c.env.D1.prepare(
      "INSERT INTO task_metadata (task_id, task_type) VALUES (?, ?)",
    )
      .bind(taskId, taskType)
      .run();

    const after = await c.env.D1.prepare(
      "SELECT status, assigned_to, deadline FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ status: string; assigned_to: string; deadline: string }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id!,
        "report_assigned",
        before,
        {
          ...after,
          task_id: taskId,
          task_type: taskType,
          unit_id,
          instructions: body.instructions ?? null,
        },
        body.reason,
        user.role,
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
          "report_assigned",
          "Laporan telah ditugaskan ke petugas.",
          id,
          c.req.path,
          c.req.method,
        );
        await c.env.D1.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id)
           VALUES (lower(hex(randomblob(16))), ?1, 'status_change', 'Laporan Ditugaskan', 'Laporan Anda telah ditugaskan ke petugas untuk ditindaklanjuti.', ?2)`,
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
    return c.json({ status: "assigned", ...after });
  }),
);
