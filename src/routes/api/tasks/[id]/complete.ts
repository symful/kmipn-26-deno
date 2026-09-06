import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { ID_REGEX } from "@/lib/id";

export const taskCompleteRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskCompleteRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const taskId = c.req.param("id");
    if (!taskId)
      return c.json(
        {
          error: {
            code: "MISSING_TASK_ID",
            message: "Pilih tugas dari daftar terlebih dahulu.",
          },
        },
        400,
      );

    if (!ID_REGEX.test(taskId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Tautan tugas tidak valid. Buka kembali tugas dari daftar.",
          },
        },
        400,
      );
    }

    const contentType = c.req.header("content-type") ?? "";
    let completionProof: string | null = null;
    let summary: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await c.req.raw.formData();
      } catch {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Gagal parsing form data",
            },
          },
          400,
        );
      }
      const summaryField = formData.get("summary");
      summary =
        summaryField &&
        typeof summaryField === "string" &&
        summaryField.length >= 5
          ? summaryField
          : null;
      const proofField = formData.get("completion_proof");
      completionProof =
        proofField && typeof proofField === "string" ? proofField : null;
    } else {
      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
          400,
        );
      }
      completionProof = body.completion_proof
        ? String(body.completion_proof)
        : null;
      const summaryRaw = body.summary;
      summary =
        summaryRaw && typeof summaryRaw === "string" && summaryRaw.length >= 5
          ? summaryRaw
          : null;
    }

    if (!summary || summary.length < 5) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tulis ringkasan pekerjaan sedikitnya 5 karakter.",
          },
        },
        400,
      );
    }

    const taskR = await c.env.D1.prepare(
      "SELECT id, report_id, status, completed_at FROM tasks WHERE id = ?1 AND (worker_id = ?2 OR assigned_to = ?2)",
    )
      .bind(taskId, user.sub)
      .first();
    if (!taskR)
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

    const currentStatus = taskR.status as string;
    if (currentStatus === "completed") {
      return c.json({
        task_id: taskId,
        status: currentStatus,
        completed_at: taskR.completed_at,
        cached: true,
      });
    }
    if (currentStatus !== "in_progress") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Mulai pengerjaan tugas sebelum mengirim penyelesaian.",
          },
        },
        409,
      );
    }

    const reportId = taskR.report_id as string;

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        "UPDATE tasks SET status = 'completed', completed_at = datetime('now'), progress_percent = 100, progress_notes = ?2, completion_evidence_urls = COALESCE(?3, (SELECT photo_urls FROM task_visits WHERE task_id = ?1 ORDER BY created_at DESC LIMIT 1), completion_evidence_urls, '[]'), verification_status = 'pending', updated_at = datetime('now') WHERE id = ?1",
      ).bind(
        taskId,
        summary,
        completionProof ? JSON.stringify([completionProof]) : null,
      ),
    );

    statements.push(
      c.env.D1.prepare(
        "UPDATE reports SET status = 'under_review', updated_at = datetime('now') WHERE id = ?1",
      ).bind(reportId),
    );

    if (statements.length > 0) await c.env.D1.batch(statements);

    const afterR = await c.env.D1.prepare(
      "SELECT id, status, completed_at FROM tasks WHERE id = ?1",
    )
      .bind(taskId)
      .first();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "petugas_task_complete",
        objectType: "task",
        objectId: taskId,
        after: afterR,
        reason: summary,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "petugas_task_complete",
          err: e,
        }),
      ),
    );

    try {
      const assigneeRow = await c.env.D1.prepare(
        "SELECT assigned_to FROM reports WHERE id = ?1",
      )
        .bind(reportId)
        .first();
      if (assigneeRow?.assigned_to) {
        await sendNotification(
          c.env,
          String(assigneeRow.assigned_to),
          "task_completed",
          `Tugas telah selesai: ${summary}`,
          String(reportId),
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

    return c.json({
      task_id: taskId,
      status: "completed",
      completion_proof: completionProof,
      completed_at: afterR!.completed_at,
    });
  }),
);
