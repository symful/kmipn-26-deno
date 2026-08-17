import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { PhotoUploadRequestSchema, PhotoBatchUploadRequestSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { generatePhotoKey, publicPhotoUrl, uploadToR2, createSignedUploadUrl } from "@/lib/r2";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const photosUploadUrlRoute = new Hono<{ Bindings: Env }>();

const BATCH_EXPIRATION_SECONDS = 3600;

// POST: Generate upload URL(s) - supports single or batch
// Single: {content_type: "image/jpeg"} returns {key, public_url, upload_url, method}
// Batch: {photos: ["image/jpeg"]} returns {urls: [{url, expires_at}]}
photosUploadUrlRoute.post(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const reportId = c.req.param("id");
    if (!reportId) return c.json({ error: { code: "INVALID_REPORT_ID", message: "Invalid report ID" } }, 400);

    if (!c.env.R2) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "r2_binding_missing",
      });
      return c.json(
        { error: { code: "CONFIGURATION_ERROR", message: "R2 storage binding is not configured on the server" } },
        503,
      );
    }

    const body = await c.req.json().catch(() => ({}));

    const batchParsed = PhotoBatchUploadRequestSchema.safeParse(body);
    if (batchParsed.success) {
      const reportCheck = await withClient(c.env, async (client) => {
        const r = await client.query<{ id: string }>("SELECT id FROM reports WHERE id = $1", [reportId]);
        return r.rows[0] !== undefined;
      });
      if (!reportCheck) return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);

      const urls = [];
      for (const contentType of batchParsed.data.photos) {
        const fileExt = contentType === "image/png" ? "png" : "jpg";
        const key = generatePhotoKey(reportId, fileExt);
        try {
          const { url, expiresAt } = await createSignedUploadUrl(c.env, key, contentType, BATCH_EXPIRATION_SECONDS);
          urls.push({ url, expires_at: expiresAt.toISOString() });
        } catch (err) {
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: err as Error,
            context: "r2_signed_url_failed",
          });
          return c.json(
            { error: { code: "STORAGE_ERROR", message: "Failed to generate upload URL" } },
            500,
          );
        }
      }
      return c.json({ urls });
    }

    const singleParsed = PhotoUploadRequestSchema.safeParse(body);
    if (!singleParsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);
    }

    const fileExt = singleParsed.data.content_type === "image/png" ? "png" : "jpg";
    const key = generatePhotoKey(reportId, fileExt);

    let publicUrl: string;
    try {
      publicUrl = publicPhotoUrl(c.env, key);
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err as Error,
        context: "r2_public_url_not_configured",
      });
      return c.json(
        { error: { code: "CONFIGURATION_ERROR", message: "Photo storage URL is not configured on the server" } },
        503,
      );
    }

    const reportCheck = await withClient(c.env, async (client) => {
      const r = await client.query<{ id: string }>("SELECT id FROM reports WHERE id = $1", [reportId]);
      return r.rows[0] !== undefined;
    });
    if (!reportCheck) return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);

    return c.json({
      key,
      public_url: publicUrl,
      upload_url: `${c.req.url}`,
      method: "PUT",
    });
  }),
);

// PUT: Accept binary upload directly (signed URL flow)
photosUploadUrlRoute.put(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const reportId = c.req.param("id");
    if (!reportId) return c.json({ error: { code: "INVALID_REPORT_ID", message: "Invalid report ID" } }, 400);

    if (!c.env.R2) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "r2_binding_missing",
      });
      return c.json(
        { error: { code: "CONFIGURATION_ERROR", message: "R2 storage binding is not configured on the server" } },
        503,
      );
    }

    const body = await c.req.arrayBuffer();
    const contentType = c.req.header("content-type") || "image/jpeg";

    // Validate content type
    if (!contentType.startsWith("image/")) {
      return c.json({ error: { code: "INVALID_FILE_TYPE", message: "Only image files are allowed" } }, 400);
    }

    const fileExt = contentType === "image/png" ? "png" : "jpg";
    const key = generatePhotoKey(reportId, fileExt);

    // Check report exists before uploading
    const reportCheck = await withClient(c.env, async (client) => {
      const r = await client.query<{ id: string }>("SELECT id FROM reports WHERE id = $1", [reportId]);
      return r.rows[0] !== undefined;
    });
    if (!reportCheck) return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);

    try {
      await uploadToR2(c.env, key, body, contentType);
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "r2_upload_failed" });
      return c.json(
        { error: { code: "STORAGE_ERROR", message: "Failed to upload photo to storage" } },
        500,
      );
    }

    let publicUrl: string;
    try {
      publicUrl = publicPhotoUrl(c.env, key);
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err as Error,
        context: "r2_public_url_not_configured",
      });
      return c.json(
        { error: { code: "CONFIGURATION_ERROR", message: "Photo storage URL is not configured on the server" } },
        503,
      );
    }

    await withClient(c.env, async (client) => {
      await client.query(
        "UPDATE reports SET photo_urls = array_append(photo_urls, $1), updated_at = NOW() WHERE id = $2",
        [publicUrl, reportId]
      );
    });

    try {
      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: c.get("user").sub,
        action: "photo_uploaded",
        objectType: "report",
        objectId: reportId,
        after: { key, url: publicUrl, content_type: contentType },
      });
    } catch (e) {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "audit_write_failed" });
    }

    return c.json({
      key,
      public_url: publicUrl,
    });
  }),
);