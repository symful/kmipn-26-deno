import type { Env } from "@/types/bindings";

async function key(secret: string | undefined) {
  if (!secret) throw new Error("Photo evidence encryption is not configured");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("sigap-photo-evidence-v2:" + secret),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealPhotoMetadata(
  env: Env,
  objectKey: string,
  value: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(objectKey),
    },
    await key(env.PHOTO_EVIDENCE_SECRET),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return "v2." + btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}

export async function openPhotoMetadata(
  env: Env,
  objectKey: string,
  value: string,
): Promise<unknown> {
  if (!value.startsWith("v2.") || value[2] !== ".")
    throw new Error("Unsupported photo metadata version");
  const bytes = Uint8Array.from(atob(value.slice(3)), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode(objectKey),
    },
    await key(env.PHOTO_EVIDENCE_SECRET),
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
