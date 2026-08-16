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

/**
 * Create a signed URL for direct upload to R2 using AWS Signature V4.
 * Returns the signed URL and expiration timestamp.
 */
export async function createSignedUploadUrl(
  env: Env,
  key: string,
  _contentType: string,
  expirationSeconds: number = 3600,
): Promise<{ url: string; expiresAt: Date }> {
  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET_NAME || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 S3-compatible credentials are not configured. Set env.R2_ACCOUNT_ID, env.R2_BUCKET_NAME, " +
      "env.R2_ACCESS_KEY_ID, and env.R2_SECRET_ACCESS_KEY before calling createSignedUploadUrl()."
    );
  }

  const expiresAt = new Date(Date.now() + expirationSeconds * 1000);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}/${env.R2_BUCKET_NAME}/${key}`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expirationSeconds),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "GET",
    `/${env.R2_BUCKET_NAME}/${key}`,
    queryParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const canonicalHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalHash,
  ].join("\n");

  const signature = await getSignature(
    env.R2_SECRET_ACCESS_KEY,
    dateStamp,
    region,
    service,
    stringToSign
  );

  const signedUrl = `${endpoint}?${queryParams.toString()}&X-Amz-Signature=${signature}`;
  return { url: signedUrl, expiresAt };
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function getSignature(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
  stringToSign: string
): Promise<string> {
  const kSecret = encoder("AWS4" + secretKey);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = await hmacSha256(kSigning, stringToSign);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encoder(data: string): ArrayBuffer {
  return new TextEncoder().encode(data);
}