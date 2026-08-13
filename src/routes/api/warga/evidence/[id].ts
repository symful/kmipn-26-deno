import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { generatePhotoKey, publicPhotoUrl, uploadToR2 } from "@/lib/r2";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EvidenceSchema = z.object({
  description: z.string().min(1, "Deskripsi bukti diperlukan"),
});

export const wargaEvidenceRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

wargaEvidenceRoute.post("/:id", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");

  if (!reportId || !UUID_REGEX.test(reportId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "ID laporan tidak valid" } }, 400);
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Gagal parsing form data" } }, 400);
  }

  const description = formData.get("description");
  if (!description || typeof description !== "string") {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Deskripsi bukti diperlukan" } }, 400);
  }

  const parsed = EvidenceSchema.safeParse({ description });
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0]?.message || "Data tidak valid" } }, 400);
  }

  const photoFile = formData.get("photo");
  if (!photoFile || !(photoFile instanceof File)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "File foto diperlukan" } }, 400);
  }

  const contentType = photoFile.type;
  if (!contentType.startsWith("image/")) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Hanya file gambar yang diizinkan" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const reportR = await client.query(
        "SELECT id, status, reporter_id FROM reports WHERE id = $1",
        [reportId]
      );
      if (!reportR.rows[0]) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      const report = reportR.rows[0];

      if (report.reporter_id !== user.sub) {
        await client.query("ROLLBACK");
        return { forbidden: true };
      }

      const fileExt = contentType === "image/png" ? "png" : "jpg";
      const key = generatePhotoKey(reportId, fileExt);

      const arrayBuffer = await photoFile.arrayBuffer();
      await uploadToR2(c.env, key, arrayBuffer, contentType);

      let publicUrl: string;
      try {
        publicUrl = publicPhotoUrl(c.env, key);
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error({ route: c.req.path, method: c.req.method, error: err as Error, context: "r2_public_url_failed" });
        return { storageError: true };
      }

      const eventR = await client.query<{ id: string }>(
        `INSERT INTO case_events (report_id, event_type, actor_id, occurred_at, metadata)
         VALUES ($1, 'evidence_submitted', $2, NOW(), $3)
         RETURNING id`,
        [reportId, user.sub, JSON.stringify({ description: parsed.data.description, photo_url: publicUrl, content_type: contentType })]
      );

      await client.query(
        "UPDATE reports SET photo_urls = array_append(photo_urls, $1), updated_at = NOW() WHERE id = $2",
        [publicUrl, reportId]
      );

      await client.query("COMMIT");
      return { evidence_id: eventR.rows[0]!.id, photo_url: publicUrl };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (result?.notFound) {
    return c.json({ error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } }, 404);
  }
  if (result?.forbidden) {
    return c.json({ error: { code: "FORBIDDEN", message: "Anda bukan pemilik laporan ini" } }, 403);
  }
  if (result?.storageError) {
    return c.json({ error: { code: "STORAGE_ERROR", message: "Gagal mengunggah foto ke storage" } }, 500);
  }

  await appendAudit(c.env, {
    actor: user.sub,
    action: "warga_evidence_submitted",
    objectType: "report",
    objectId: reportId,
    after: { evidence_id: result!.evidence_id, photo_url: result!.photo_url },
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, err: e }));

  return c.json({ success: true, evidence_id: result!.evidence_id }, 201);
}));
