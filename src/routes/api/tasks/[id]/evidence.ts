import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { ID_REGEX } from "@/lib/id";

export const taskEvidenceRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskEvidenceRoute.post(
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

    const photoUrlsRaw = body.photo_urls;
    if (!Array.isArray(photoUrlsRaw) || photoUrlsRaw.length === 0) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tambahkan sedikitnya satu foto bukti.",
          },
        },
        400,
      );
    }
    const photoUrls: string[] = photoUrlsRaw.map((u) => String(u));
    const notes = body.notes ? String(body.notes) : null;

    const taskR = await c.env.D1.prepare(
      "SELECT id, status, verification_status FROM tasks WHERE id = ?1 AND (?3 = 'ADMIN' OR worker_id = ?2 OR assigned_to = ?2)",
    )
      .bind(taskId, user.sub, user.role)
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
    if (
      !["assigned", "accepted", "in_progress", "completed"].includes(
        currentStatus,
      ) ||
      taskR.verification_status === "verified"
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Cannot add evidence to task in '${currentStatus}' status`,
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        `INSERT INTO task_evidence (id, task_id, photo_urls, notes, created_at)
     VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, datetime('now'))`,
      ).bind(taskId, JSON.stringify(photoUrls), notes),
    );
    statements.push(
      c.env.D1.prepare(
        "UPDATE tasks SET completion_evidence_urls = ?, updated_at = datetime('now') WHERE id = ?",
      ).bind(JSON.stringify(photoUrls), taskId),
    );

    if (statements.length > 0) await c.env.D1.batch(statements);

    const lastIdR = await c.env.D1.prepare(
      "SELECT last_insert_rowid() as id",
    ).first<{ id: number }>();
    const evidenceId = lastIdR!.id;

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "petugas_task_evidence",
        objectType: "task",
        objectId: taskId,
        after: { evidence_id: evidenceId, photo_count: photoUrls.length },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "petugas_task_evidence",
          err: e,
        }),
      ),
    );

    return c.json({
      success: true,
      evidence_id: evidenceId,
      task_id: taskId,
      photo_urls: photoUrls,
    });
  }),
);
