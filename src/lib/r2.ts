import type { Env } from "@/types/bindings";

const PHOTO_KEY_PREFIX = "reports";

export function generatePhotoKey(
  reportId: string,
  fileExt: string = "jpg",
): string {
  const randomId = crypto.randomUUID();
  return `${PHOTO_KEY_PREFIX}/${reportId}/${randomId}.${fileExt}`;
}

export async function uploadToR2(
  env: Env,
  key: string,
  body: ArrayBuffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await env.R2.put(key, body, {
    httpMetadata: { contentType },
  });
}

export async function fetchFromR2(
  env: Env,
  key: string,
): Promise<ArrayBuffer | null> {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return await obj.arrayBuffer();
}

export function publicPhotoUrl(env: Env, key: string): string {
  const base = env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "R2_PUBLIC_URL is not configured. Set env.R2_PUBLIC_URL to your R2 public bucket URL " +
        "(e.g. https://r2.sigap.live) before calling publicPhotoUrl().",
    );
  }
  return `${base}/${key}`;
}
