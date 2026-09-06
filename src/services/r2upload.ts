import type { Env } from "@/types/bindings";

/**
 * Payload encoded in an HMAC upload token.
 * The token is: base64url(JSON.stringify(payload)) + "." + HMAC-SHA256(base64url(JSON), JWT_SECRET)
 */
export interface UploadTokenPayload {
  report_id: string;
  uploader_id: string;
  slot: number;
  /** Unix ms expiry timestamp */
  exp: number;
}

function base64urlEncode(data: string): string {
  const bytes = new TextEncoder().encode(data);
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return base64urlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Generate an HMAC upload token.
 * @param env  Env with JWT_SECRET bound
 * @param payload  Upload token payload
 * @returns  A signed token string
 */
export async function signUploadToken(
  env: Env,
  payload: UploadTokenPayload,
): Promise<string> {
  const encoded = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(encoded, env.JWT_SECRET);
  return `${encoded}.${sig}`;
}

export class UploadTooLargeError extends Error {
  constructor(message: string = "Upload exceeds the maximum allowed size") {
    super(message);
    this.name = "UploadTooLargeError";
  }
}

export class InvalidImageError extends Error {
  constructor(
    message: string = "Uploaded data is not a supported image format",
  ) {
    super(message);
    this.name = "InvalidImageError";
  }
}

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/**
 * Payload encoded in an HMAC report-scoped upload token (24h expiry).
 */
export interface ReportUploadTokenPayload {
  report_id: string;
  uploader_id: string;
  slot: number;
  /** Unix ms expiry timestamp */
  exp: number;
}

/**
 * Issue a report-scoped upload token for a given reporter/uploader.
 * Used when creating a report or when a petugas/assignee needs to upload photos.
 * Token payload: { report_id, uploader_id, exp } — exp = 24h from now.
 *
 * @param env     Env with JWT_SECRET bound
 * @param reportId  The report to scope the token to
 * @param uploaderId The user/anonymous device that will use this token
 * @returns A signed HMAC token string
 */
export async function issueReportUploadToken(
  env: Env,
  reportId: string,
  uploaderId: string,
  slot: number,
): Promise<string> {
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload: ReportUploadTokenPayload = {
    report_id: reportId,
    uploader_id: uploaderId,
    slot,
    exp,
  };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(encoded, env.JWT_SECRET);
  return `${encoded}.${sig}`;
}

/**
 * Verify a report-scoped upload token.
 * Returns the decoded payload or throws InvalidTokenError.
 *
 * @param env    Env with JWT_SECRET bound
 * @param token  The token string returned by issueReportUploadToken
 * @throws InvalidTokenError if token is malformed, tampered, or expired
 */
export async function verifyReportUploadToken(
  env: Env,
  token: string,
): Promise<ReportUploadTokenPayload> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) {
    throw new InvalidTokenError("Token format invalid");
  }
  const encoded = token.slice(0, lastDot);
  const providedSig = token.slice(lastDot + 1);

  const expectedSig = await hmacSha256(encoded, env.JWT_SECRET);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    throw new InvalidTokenError("Token signature mismatch");
  }

  let payload: ReportUploadTokenPayload;
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(encoded));
    payload = JSON.parse(decoded) as ReportUploadTokenPayload;
  } catch {
    throw new InvalidTokenError("Token payload decode failed");
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    throw new InvalidTokenError("Token expired");
  }

  return payload;
}

/**
 * Verify and decode an HMAC upload token.
 * @param env  Env with JWT_SECRET bound
 * @param token  The token string returned by signUploadToken
 * @returns The decoded payload
 * @throws InvalidTokenError if the token is malformed, tampered, or expired
 */
export async function verifyUploadToken(
  env: Env,
  token: string,
): Promise<UploadTokenPayload> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) {
    throw new InvalidTokenError("Token format invalid");
  }
  const encoded = token.slice(0, lastDot);
  const providedSig = token.slice(lastDot + 1);

  const expectedSig = await hmacSha256(encoded, env.JWT_SECRET);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    throw new InvalidTokenError("Token signature mismatch");
  }

  let payload: UploadTokenPayload;
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(encoded));
    payload = JSON.parse(decoded) as UploadTokenPayload;
  } catch {
    throw new InvalidTokenError("Token payload decode failed");
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    throw new InvalidTokenError("Token expired");
  }

  return payload;
}

function base64urlDecode(str: string): Uint8Array {
  // Restore base64 characters that were replaced
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad with = to make length a multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Maximum allowed photo upload size in bytes (10 MB). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Detect image type from raw bytes using magic-byte signatures.
 * Returns extension and MIME type, or null if the format is unrecognized.
 */
export function detectImageType(
  body: ArrayBuffer,
): { ext: string; contentType: string } | null {
  const b = new Uint8Array(body.slice(0, 12));
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: "png", contentType: "image/png" };
  }
  // WebP: RIFF....WEBP
  const sig = String.fromCharCode(...b);
  if (sig.startsWith("RIFF") && sig.slice(8, 12) === "WEBP") {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

/**
 * Upload a report photo into R2 and return the stored key.
 *
 * @param env       R2 bucket binding
 * @param reportId  The report id (used in the R2 key path)
 * @param slot      Photo slot index (0-based)
 * @param body      Raw binary body from the PUT request
 * @returns The R2 object key that was stored
 * @throws UploadTooLargeError  if body exceeds MAX_PHOTO_BYTES
 * @throws InvalidImageError    if body is not a supported image format
 */
export async function putReportPhoto(
  env: Env,
  reportId: string,
  slot: number,
  body: ArrayBuffer,
): Promise<string> {
  if (body.byteLength > MAX_PHOTO_BYTES) {
    throw new UploadTooLargeError(
      `Upload size ${body.byteLength} exceeds maximum ${MAX_PHOTO_BYTES}`,
    );
  }
  const detected = detectImageType(body);
  if (!detected) {
    throw new InvalidImageError(
      `Uploaded data is not a supported image format (JPEG/PNG/WebP)`,
    );
  }
  const key = `reports/${reportId}/${slot}.${detected.ext}`;
  await env.R2.put(key, body, {
    httpMetadata: { contentType: detected.contentType },
  });
  return key;
}
