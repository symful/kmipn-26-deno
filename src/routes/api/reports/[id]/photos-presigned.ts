import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { optionalAuth } from "@/lib/auth";
import {
  signUploadToken,
  verifyUploadToken,
  verifyReportUploadToken,
  putReportPhoto,
  InvalidTokenError,
  UploadTooLargeError,
  InvalidImageError,
} from "@/services/r2upload";
import { generateId } from "@/lib/id";
import { logger } from "@/lib/logger";

export const photosPresignedRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

function isAdminOrExec(role: string): boolean {
  return role === "ADMIN";
}

// POST / — generate presigned PUT URL
photosPresignedRoute.post("/", optionalAuth, async (c) => {
  const user = c.get("user"); // may be undefined if no auth header
  const reportId = c.req.param("id") as string;

  const reportRow = await c.env.D1.prepare(
    "SELECT reporter_id FROM reports WHERE id = ?",
  )
    .bind(reportId)
    .first<{ reporter_id: string }>();

  if (!reportRow) {
    return c.json({ error: "not_found" }, 404);
  }

  // Try uploadToken first (query param ?uploadToken= or header x-upload-token)
  const uploadToken =
    c.req.query("uploadToken") ?? c.req.header("x-upload-token") ?? undefined;
  let uploaderId: string = user!.sub;

  if (uploadToken) {
    try {
      const payload = await verifyReportUploadToken(c.env, uploadToken);
      if (payload.report_id !== reportId) {
        return c.json({ error: "forbidden" }, 403);
      }
      uploaderId = payload.uploader_id;
    } catch {
      // Invalid/expired token — fall through to JWT owner/admin check
      if (!user) {
        return c.json({ error: "forbidden" }, 403);
      }
      const isOwner = user.sub === reportRow.reporter_id;
      const isAdminExec = isAdminOrExec(user.role);
      if (!isOwner && !isAdminExec) {
        return c.json({ error: "forbidden" }, 403);
      }
      uploaderId = user.sub;
    }
  } else {
    if (!user) {
      return c.json({ error: "forbidden" }, 403);
    }
    const isOwner = user.sub === reportRow.reporter_id;
    const isAdminExec = isAdminOrExec(user.role);
    if (!isOwner && !isAdminExec) {
      if (user.role === "PETUGAS") {
        const taskRow = await c.env.D1.prepare(
          "SELECT id FROM tasks WHERE report_id = ? AND assigned_to = ? AND status IN ('assigned','in_progress') LIMIT 1",
        )
          .bind(reportId, user.sub)
          .first();
        if (!taskRow) {
          return c.json({ error: "forbidden" }, 403);
        }
      } else {
        return c.json({ error: "forbidden" }, 403);
      }
    }
    uploaderId = user.sub;
  }

  const slotStr = c.req.query("slot");
  const slot = slotStr ? parseInt(slotStr, 10) : 0;
  if (isNaN(slot) || slot < 0) {
    return c.json({ error: "invalid_slot" }, 400);
  }

  const exp = Date.now() + 15 * 60 * 1000;
  const token = await signUploadToken(c.env, {
    report_id: reportId,
    uploader_id: uploaderId,
    slot,
    exp,
  });

  const r2PublicUrl = (c.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const appBaseUrl = (c.env.APP_BASE_URL ?? "https://sigap.live").replace(
    /\/+$/,
    "",
  );
  const putPath = `/api/reports/${reportId}/photos/put?token=${token}`;
  const putUrl = `${appBaseUrl}${putPath}`;
  const uploadUrl = `${appBaseUrl}${putPath}`;
  const photoUrl = `${r2PublicUrl}/reports/${reportId}/slots/${slot}`;
  return c.json({ putUrl, upload_url: uploadUrl, photo_url: photoUrl });
});

// PUT /put — receive binary photo data, store in R2
photosPresignedRoute.put("/put", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ error: "unauthorized", message: "Missing token" }, 401);
  }

  let payload: {
    report_id: string;
    uploader_id: string;
    slot: number;
    exp: number;
  };
  try {
    payload = await verifyUploadToken(c.env, token);
  } catch {
    try {
      const reportPayload = await verifyReportUploadToken(c.env, token);
      payload = {
        report_id: reportPayload.report_id,
        uploader_id: reportPayload.uploader_id,
        slot: reportPayload.slot,
        exp: reportPayload.exp,
      };
    } catch (err) {
      const msg =
        err instanceof InvalidTokenError ? err.message : "invalid_token";
      return c.json({ error: "forbidden", message: msg }, 403);
    }
  }

  const reportId = c.req.param("id") as string;
  if (payload.report_id !== reportId) {
    return c.json(
      { error: "forbidden", message: "Token report_id mismatch" },
      403,
    );
  }

  const body = await c.req.arrayBuffer();

  let key: string;
  try {
    key = await putReportPhoto(c.env, reportId, payload.slot, body);
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return c.json({ error: "payload_too_large" }, 413);
    }
    if (err instanceof InvalidImageError) {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    throw err;
  }

  const publicUrl = `${(c.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "")}/${key}`;

  const existingRow = await c.env.D1.prepare(
    "SELECT photo_urls FROM reports WHERE id = ?",
  )
    .bind(reportId)
    .first<{ photo_urls: string | null }>();

  let urls: string[] = [];
  if (existingRow?.photo_urls) {
    try {
      urls = JSON.parse(existingRow.photo_urls);
    } catch (parseErr) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error:
          parseErr instanceof Error ? parseErr : new Error(String(parseErr)),
        context: "photo_urls_parse_failed",
        report_id: reportId,
      });
      urls = [];
    }
  }

  if (!urls.includes(publicUrl)) {
    urls.push(publicUrl);
  }

  const updatedUrls = JSON.stringify(urls);
  await c.env.D1.prepare("UPDATE reports SET photo_urls = ? WHERE id = ?")
    .bind(updatedUrls, reportId)
    .run();

  return c.json({ ok: true, photo_urls: urls });
});
