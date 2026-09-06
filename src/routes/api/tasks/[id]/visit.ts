import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const taskVisitRoute = new Hono<{ Bindings: Env }>();

taskVisitRoute.post(
  "/",
  safeHandler(async (c) => {
    const taskId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json();
    const key = body.idempotency_key;
    if (
      key !== undefined &&
      (typeof key !== "string" || key.length < 1 || key.length > 128)
    ) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid idempotency_key",
          },
        },
        400,
      );
    }

    const {
      findings,
      checklist,
      photo_urls,
      condition_assessment,
      recommendation,
      gps,
      notes,
      dimensions,
    } = body;

    // Validate gps is present (required for survey visits)
    if (
      !gps ||
      !Number.isFinite(gps.lat) ||
      !Number.isFinite(gps.lng) ||
      Math.abs(gps.lat) > 90 ||
      Math.abs(gps.lng) > 180
    ) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Ambil lokasi GPS sebelum mengirim hasil kunjungan.",
          },
        },
        400,
      );
    }

    const taskR = await c.env.D1.prepare(
      "SELECT id, status, report_id, progress_percent FROM tasks WHERE id = ?1 AND (assigned_to = ?2 OR worker_id = ?2)",
    )
      .bind(taskId, user.sub)
      .first();
    if (!taskR) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message:
              "Tugas tidak ditemukan atau tidak tersedia untuk akun Anda.",
          },
        },
        404,
      );
    }

    const digest =
      key === undefined
        ? null
        : await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify([taskId, user.sub, key])),
          );
    const visitId = digest
      ? Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")
      : crypto.randomUUID();
    const cachedVisit = async () => {
      const saved = await c.env.D1.prepare(
        "SELECT id, created_at FROM task_visits WHERE id = ? AND task_id = ? AND worker_id = ?",
      )
        .bind(visitId, taskId, user.sub)
        .first<{ id: string; created_at: string }>();
      return saved
        ? c.json({
            visit_id: saved.id,
            task_id: taskId,
            report_id: taskR.report_id,
            status: taskR.status,
            progress_percent: taskR.progress_percent,
            created_at: saved.created_at,
            cached: true,
          })
        : null;
    };
    if (key !== undefined) {
      const cached = await cachedVisit();
      if (cached) return cached;
    }
    const currentStatus = taskR.status as string;
    if (currentStatus !== "in_progress") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Mulai pengerjaan tugas sebelum mengirim hasil kunjungan.",
          },
        },
        409,
      );
    }

    const createdAt = new Date().toISOString();
    const survey = {
      findings: findings ?? null,
      condition_assessment: condition_assessment ?? null,
      recommendation: recommendation ?? null,
      notes: notes ?? null,
      dimensions: dimensions ?? null,
    };
    const insertR = await c.env.D1.prepare(
      `INSERT OR IGNORE INTO task_visits (id, task_id, worker_id, findings, checklist, photo_urls, gps_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        visitId,
        taskId,
        user.sub,
        JSON.stringify(survey),
        JSON.stringify(checklist ?? []),
        JSON.stringify(photo_urls ?? []),
        JSON.stringify(gps),
        createdAt,
      )
      .run();

    if (!insertR.success) {
      return c.json(
        {
          error: {
            code: "INSERT_FAILED",
            message: "Failed to create visit record",
          },
        },
        500,
      );
    }
    if (insertR.meta.changes === 0 && key !== undefined) {
      const cached = await cachedVisit();
      if (cached) return cached;
    }

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        actor: user.sub,
        action: "visit_submitted",
        objectType: "task",
        objectId: taskId,
        before: undefined,
        after: { visit_id: visitId, findings: findings ?? null },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    if (condition_assessment || recommendation || notes) {
      const noteParts: string[] = [];
      if (condition_assessment) {
        noteParts.push(`condition_assessment=${condition_assessment}`);
      }
      if (recommendation) {
        noteParts.push(`recommendation=${recommendation}`);
      }
      if (notes) {
        noteParts.push(notes);
      }
      await c.env.D1.prepare(
        `UPDATE tasks SET progress_notes = COALESCE(progress_notes || ' | ', '') || ?1, updated_at = datetime('now') WHERE id = ?2`,
      )
        .bind(noteParts.join(" | "), taskId)
        .run();
    }

    const afterVisitR = await c.env.D1.prepare(
      "SELECT id, report_id, status, progress_percent FROM tasks WHERE id = ?1",
    )
      .bind(taskId)
      .first<{
        id: string;
        report_id: string;
        status: string;
        progress_percent: number;
      }>();

    return c.json({
      visit_id: visitId,
      task_id: taskId,
      report_id: afterVisitR?.report_id ?? null,
      status: afterVisitR?.status ?? null,
      progress_percent: afterVisitR?.progress_percent ?? null,
      created_at: createdAt,
    });
  }),
);
