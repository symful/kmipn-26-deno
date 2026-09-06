import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { generatePhotoKey, publicPhotoUrl } from "@/lib/r2";
import { logger } from "@/lib/logger";
import { storeEvidencePhoto, validateOriginalPhoto } from "@/lib/photoEvidence";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const anonymousPhotosUploadUrlRoute = new Hono<{ Bindings: Env }>();

anonymousPhotosUploadUrlRoute.post(
  "/",
  safeHandler(async (c) => {
    if (!c.env.R2) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "r2_binding_missing",
      });
      return c.json(
        {
          error: {
            code: "CONFIGURATION_ERROR",
            message: "R2 storage binding is not configured on the server",
          },
        },
        503,
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
            message: "Failed to parse multipart form data",
          },
        },
        400,
      );
    }

    const photoFile = formData.get("photo");
    const original = formData.get("original_photo");
    const originalError = validateOriginalPhoto(original);
    if (originalError)
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: originalError } },
        400,
      );
    if (!photoFile || !(photoFile instanceof File)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Photo file is required",
          },
        },
        400,
      );
    }

    const contentType = photoFile.type;
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Only image/jpeg, image/png, and image/webp are allowed",
          },
        },
        400,
      );
    }

    if (photoFile.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "File size must not exceed 10 MB",
          },
        },
        400,
      );
    }

    const idempotencyKeyField = formData.get("idempotency_key");
    const idempotencySuffix =
      idempotencyKeyField && typeof idempotencyKeyField === "string"
        ? `_${idempotencyKeyField}`
        : "";

    const fileExt =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    const tempReportId = crypto.randomUUID();
    const key = generatePhotoKey(
      `anon${idempotencySuffix}/${tempReportId}`,
      fileExt,
    );

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
        {
          error: {
            code: "CONFIGURATION_ERROR",
            message: "Photo storage URL is not configured on the server",
          },
        },
        503,
      );
    }

    try {
      await storeEvidencePhoto(
        c.env,
        key,
        photoFile,
        original instanceof File ? original : null,
      );
    } catch (err) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: err as Error,
        context: "r2_upload_failed",
      });
      return c.json(
        {
          error: {
            code: "STORAGE_ERROR",
            message: "Failed to upload photo to storage",
          },
        },
        500,
      );
    }

    return c.json({ public_url: publicUrl });
  }),
);
