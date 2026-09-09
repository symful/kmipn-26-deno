import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { ProgressSchema, PetugasProgressSchema } from "@/lib/schemas";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { ID_REGEX } from "@/lib/id";

export const taskProgressRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskProgressRoute.patch(
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

    let body: Record<string, unknown>;

    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
        400,
      );
    }

    const hasStatus = "status" in body;
    const validated = hasStatus
      ? PetugasProgressSchema.parse(body)
      : ProgressSchema.parse(body);

    const taskR = await c.env.D1.prepare(
      "SELECT id, report_id, status, progress_percent, verification_status FROM tasks WHERE id = ?1 AND (?3 = 'ADMIN' OR worker_id = ?2 OR assigned_to = ?2)",
    )
      .bind(taskId, user.sub, user.role)
      .first<{
        id: string;
        report_id: string;
        status: string;
        progress_percent: number;
        verification_status: string;
      }>();
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
    if (
      taskR.verification_status === "verified" ||
      currentStatus === "rejected"
    )
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Tugas yang telah ditutup tidak dapat diperbarui",
          },
        },
        409,
      );

    const statements: D1PreparedStatement[] = [];
    const updateFields: string[] = ["updated_at = datetime('now')"];
    const updateParams: (string | number | null)[] = [];
    let paramIdx = 1;

    if (hasStatus) {
      const progressBody = validated as {
        status: string;
        notes?: string;
        completion_evidence_urls?: string[];
      };
      const newStatus = progressBody.status;

      const validTransitions: Record<string, string[]> = {
        assigned: ["in_progress"],
        accepted: ["in_progress"],
        in_progress: ["completed", "pending_clarification"],
        pending_clarification: ["in_progress"],
        completed: [],
      };
      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        return c.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
            },
          },
          409,
        );
      }

      updateFields.push(`status = ?${paramIdx++}`);
      updateParams.push(newStatus);

      if (newStatus === "in_progress" && currentStatus === "assigned") {
        updateFields.push("started_at = COALESCE(started_at, datetime('now'))");
      }
      if (newStatus === "completed") {
        updateFields.push(
          "completed_at = COALESCE(completed_at, datetime('now'))",
        );
        updateFields.push("progress_percent = 100");
      }

      if (progressBody.notes) {
        updateFields.push(`progress_notes = ?${paramIdx++}`);
        updateParams.push(progressBody.notes);
      }

      if (
        progressBody.completion_evidence_urls &&
        progressBody.completion_evidence_urls.length > 0
      ) {
        updateFields.push(`completion_evidence_urls = ?${paramIdx++}`);
        updateParams.push(
          JSON.stringify(progressBody.completion_evidence_urls),
        );
      }
    } else {
      const legacyBody = validated as {
        progress_percent: number;
        notes?: string;
        estimated_completion?: string;
      };
      if (
        !["in_progress", "assigned", "accepted", "completed"].includes(
          currentStatus,
        )
      ) {
        return c.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: `Cannot update progress for task in '${currentStatus}' status`,
            },
          },
          409,
        );
      }
      if (
        currentStatus === "assigned" ||
        currentStatus === "accepted" ||
        currentStatus === "completed"
      ) {
        updateFields.push("status = 'in_progress'");
        updateFields.push("started_at = COALESCE(started_at, datetime('now'))");
      }

      updateFields.push(`progress_percent = ?${paramIdx++}`);
      updateParams.push(legacyBody.progress_percent);
      if (legacyBody.progress_percent === 100) {
        // The explicit progress submission marks work ready for operator review.
        updateFields.push(
          "status = 'completed'",
          "completed_at = datetime('now')",
          "verification_status = 'pending'",
        );
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'under_review', updated_at = datetime('now') WHERE id = ?",
          ).bind(taskR.report_id),
        );
      } else {
        statements.push(
          c.env.D1.prepare(
            "UPDATE reports SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?",
          ).bind(taskR.report_id),
        );
      }

      if (legacyBody.notes) {
        updateFields.push(`progress_notes = ?${paramIdx++}`);
        updateParams.push(legacyBody.notes);
      }

      if (legacyBody.estimated_completion) {
        const estimatedCompletion = new Date(legacyBody.estimated_completion);
        if (estimatedCompletion <= new Date()) {
          return c.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: "Pilih perkiraan selesai setelah waktu sekarang.",
              },
            },
            400,
          );
        }
        updateFields.push(`estimated_completion = ?${paramIdx++}`);
        updateParams.push(estimatedCompletion.toISOString());
      }
    }

    updateParams.push(taskId);

    statements.push(
      c.env.D1.prepare(
        `UPDATE tasks SET ${updateFields.join(", ")} WHERE id = ?${paramIdx}`,
      ).bind(...updateParams),
    );

    if (statements.length > 0) await c.env.D1.batch(statements);

    const afterR = await c.env.D1.prepare(
      "SELECT id, status, progress_percent, progress_notes, estimated_completion, completion_evidence_urls, resolution_evidence_urls FROM tasks WHERE id = ?1",
    )
      .bind(taskId)
      .first<Record<string, unknown>>();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "petugas_task_progress",
        objectType: "task",
        objectId: taskId,
        after: afterR,
        reason: (validated as { notes?: string }).notes ?? "",
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "petugas_task_progress",
          err: e,
        }),
      ),
    );

    return c.json({
      status: afterR!.status,
      progress_percent: afterR!.progress_percent,
      progress_notes: afterR!.progress_notes,
      estimated_completion: afterR!.estimated_completion,
      completion_evidence_urls: afterR!.completion_evidence_urls
        ? JSON.parse(afterR!.completion_evidence_urls as string)
        : null,
      resolution_evidence_urls: afterR!.resolution_evidence_urls
        ? JSON.parse(afterR!.resolution_evidence_urls as string)
        : null,
    });
  }),
);
