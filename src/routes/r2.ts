import { Hono } from "hono";
import type { Env } from "@/types/bindings";

/**
 * R2 proxy route for local development.
 *
 * In production, R2 objects are served via the public bucket URL (e.g. https://r2.sigap.live).
 * In local development (wrangler dev), R2 objects need to be proxied through the worker.
 *
 * This route handles GET /r2/* requests and fetches the corresponding R2 object.
 *
 * Usage: Set R2_PUBLIC_URL=http://localhost:8787/r2 in your local environment.
 */
export const r2ProxyRoute = new Hono<{ Bindings: Env }>();

r2ProxyRoute.get("/*", async (c) => {
  // Extract the key from the URL path (remove /r2/ prefix)
  const url = new URL(c.req.url);
  const key = url.pathname.replace(/^\/r2\//, "");

  if (!key) {
    return c.json({ error: "Missing R2 object key" }, 400);
  }

  // Check if R2 binding is available
  if (!c.env.R2) {
    return c.json({ error: "R2 bucket binding is not configured" }, 503);
  }

  try {
    const obj = await c.env.R2.get(key);

    if (!obj) {
      return c.json({ error: "Object not found" }, 404);
    }

    // Get content type from metadata or infer from extension
    const contentType = obj.httpMetadata?.contentType || inferContentType(key);

    // Return the object with proper headers
    return new Response(obj.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("R2 proxy error:", err);
    return c.json({ error: "Failed to fetch R2 object" }, 500);
  }
});

/**
 * Infer content type from file extension.
 */
function inferContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}
