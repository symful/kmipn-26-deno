import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { generatePhotoKey, publicPhotoUrl, uploadToR2 } from "@/lib/r2";
import { z } from "zod";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { ID_REGEX } from "@/lib/id";

const EvidenceSchema = z.object({
  description: z.string().min(1, "Deskripsi bukti diperlukan"),
});

export const evidenceRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

evidenceRoute.post(
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

    const description = formData.get("description");
    if (!description || typeof description !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Deskripsi bukti diperlukan",
          },
        },
        400,
      );
    }

    const parsed = EvidenceSchema.safeParse({ description });
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Data tidak valid",
          },
        },
        400,
      );
    }

    const photoFile = formData.get("photo");
    if (!photoFile || !(photoFile instanceof File)) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "File foto diperlukan" },
        },
        400,
      );
    }

    const contentType = photoFile.type;
    if (!contentType.startsWith("image/")) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Hanya file gambar yang diizinkan",
          },
        },
        400,
      );
    }

    const reportR = await c.env.D1.prepare(
      "SELECT id, status, reporter_id FROM reports WHERE id = ?",
    )
      .bind(reportId)
      .first();
    if (!reportR)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } },
        404,
      );

    // WARGA can only submit evidence on their own reports
    // ADMIN and PETUGAS can submit on any report
    if (user.role === "WARGA" && reportR.reporter_id !== user.sub) {
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

    const fileExt = contentType === "image/png" ? "png" : "jpg";
    const key = generatePhotoKey(reportId, fileExt);

    const arrayBuffer = await photoFile.arrayBuffer();
    await uploadToR2(c.env, key, arrayBuffer, contentType);

    let publicUrl: string;
    try {
      publicUrl = publicPhotoUrl(c.env, key);
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err as Error,
        context: "r2_public_url_failed",
      });
      return c.json(
        {
          error: {
            code: "STORAGE_ERROR",
            message: "Gagal mengunggah foto ke storage",
          },
        },
        500,
      );
    }

    const statements: D1PreparedStatement[] = [];
    statements.push(
      c.env.D1.prepare(
        `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at, metadata)
     VALUES (lower(hex(randomblob(16))), ?, 'evidence_submitted', ?, (datetime('now')), ?)`,
      ).bind(
        reportId,
        user.sub,
        JSON.stringify({
          description: parsed.data.description,
          photo_url: publicUrl,
          content_type: contentType,
        }),
      ),
    );

    const reportR2 = await c.env.D1.prepare(
      "SELECT photo_urls FROM reports WHERE id = ?",
    )
      .bind(reportId)
      .first<{ photo_urls: string | null }>();
    const existingUrls: string[] = reportR2?.photo_urls
      ? JSON.parse(reportR2.photo_urls)
      : [];
    existingUrls.push(publicUrl);
    statements.push(
      c.env.D1.prepare(
        "UPDATE reports SET photo_urls = ?, updated_at = (datetime('now')) WHERE id = ?",
      ).bind(JSON.stringify(existingUrls), reportId),
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
        action: "warga_evidence_submitted",
        objectType: "report",
        objectId: reportId,
        after: { evidence_id: evidenceId, photo_url: publicUrl },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          err: e,
        }),
      ),
    );

    return c.json({ success: true, evidence_id: evidenceId }, 201);
  }),
);
