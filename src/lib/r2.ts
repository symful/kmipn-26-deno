import type { Env } from "@/types/bindings";

const PHOTO_KEY_PREFIX = "reports";

export function generatePhotoKey(reportId: string, fileExt: string = "jpg"): string {
  const randomId = crypto.randomUUID();
  return `${PHOTO_KEY_PREFIX}/${reportId}/${randomId}.${fileExt}`;
}

export async function uploadToR2(env: Env, key: string, body: ArrayBuffer | Uint8Array | string, contentType: string): Promise<void> {
  await env.R2.put(key, body, {
    httpMetadata: { contentType },
  });
}

export async function fetchFromR2(env: Env, key: string): Promise<ArrayBuffer | null> {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return await obj.arrayBuffer();
}

export async function deleteFromR2(env: Env, key: string): Promise<void> {
  await env.R2.delete(key);
}

/**
 * Return the URL that a browser can use to GET this photo.
 *
 * Uses env.R2_PUBLIC_URL if set (recommended — point it at a Cloudflare R2
 * custom domain like https://media.sigap.live, or the R2 public bucket
 * subdomain like https://pub-XXXX.r2.dev).
 *
 * If R2_PUBLIC_URL is not set, returns a path-style URL that will only
 * resolve when served via a worker proxy. Returning a domain with
 * example.com would be silently broken (the file is in R2, not
 * example.com), so we explicitly mark it as unconfigured instead.
 */
export function publicPhotoUrl(env: Env, key: string): string {
  const base = env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base) {
    // No public URL configured — caller should treat this as a misconfiguration.
    // Returning the bare key forces any downstream consumer to surface the gap.
    throw new Error(
      "R2_PUBLIC_URL is not configured. Set env.R2_PUBLIC_URL to your R2 public bucket URL " +
      "(e.g. https://media.sigap.live) before calling publicPhotoUrl()."
    );
  }
  return `${base}/${key}`;
}