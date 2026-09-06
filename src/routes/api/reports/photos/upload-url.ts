import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { generatePhotoKey, publicPhotoUrl } from "@/lib/r2";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { storeEvidencePhoto, validateOriginalPhoto } from "@/lib/photoEvidence";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const photosUploadUrlRoute = new Hono<{ Bindings: Env }>();

photosUploadUrlRoute.post(
  "/",
  safeHandler(async (c) => {
    const reportId = c.req.param("id");
    if (!reportId)
      return c.json(
        { error: { code: "INVALID_REPORT_ID", message: "Invalid report ID" } },
        400,
      );

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

    const reportCheck = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE id = ?",
    )
      .bind(reportId)
      .first<{ id: string }>();
    if (!reportCheck)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );

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

    const photoFiles = formData
      .getAll("photo")
      .filter((f): f is File => f instanceof File);

    if (photoFiles.length === 0) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "At least one photo file is required",
          },
        },
        400,
      );
    }

    if (photoFiles.length > 20) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Maximum 20 photos per upload",
          },
        },
        400,
      );
    }

    const urls: string[] = [];
    const originals = formData.getAll("original_photo");
    if (originals.length && originals.length !== photoFiles.length)
      return c.json(
        { error: "Original photo count must match photo count" },
        400,
      );
    for (const original of originals) {
      const error = validateOriginalPhoto(original);
      if (error) return c.json({ error }, 400);
    }

    for (const [index, photoFile] of photoFiles.entries()) {
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

      const fileExt =
        contentType === "image/png"
          ? "png"
          : contentType === "image/webp"
            ? "webp"
            : "jpg";
      const key = generatePhotoKey(reportId, fileExt);

      try {
        await storeEvidencePhoto(
          c.env,
          key,
          photoFile,
          originals[index] instanceof File ? (originals[index] as File) : null,
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

      urls.push(publicUrl);
    }

    if (formData.get("purpose") !== "task_evidence") {
      const report = await c.env.D1.prepare(
        "SELECT photo_urls FROM reports WHERE id = ?",
      )
        .bind(reportId)
        .first<{ photo_urls: string }>();
      const currentUrls = report?.photo_urls
        ? JSON.parse(report.photo_urls)
        : [];
      currentUrls.push(...urls);

      await (async () => {
        try {
          await c.env.D1.prepare(
            "UPDATE reports SET photo_urls = ?, updated_at = datetime('now') WHERE id = ?",
          )
            .bind(JSON.stringify(currentUrls), reportId)
            .run();
        } catch (e) {
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e as Error,
            context: "db_update_failed",
          });
        }
      })();
    }
    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: c.get("user").sub,
        action: "photo_uploaded",
        objectType: "report",
        objectId: reportId,
        after: { url_count: urls.length },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    if (urls.length === 1) {
      return c.json({ public_url: urls[0] });
    }
    return c.json({ urls });
  }),
);
