import type { Env } from "@/types/bindings";
async function key(secret: string | undefined, version: "v1" | "v2") {
  if (!secret) throw new Error("Photo evidence encryption is not configured");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`sigap-photo-evidence-${version}:` + secret),
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
    await key(env.PHOTO_EVIDENCE_SECRET, "v2"),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return "v2." + btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}
export async function openPhotoMetadata(
  env: Env,
  objectKey: string,
  value: string,
): Promise<unknown> {
  const version = value.slice(0, 2);
  if (!["v1", "v2"].includes(version) || value[2] !== ".")
    throw new Error("Unsupported photo metadata");
  const secret =
    version === "v1"
      ? env.LEGACY_PHOTO_EVIDENCE_SECRET
      : env.PHOTO_EVIDENCE_SECRET;
  const bytes = Uint8Array.from(atob(value.slice(3)), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode(objectKey),
    },
    await key(secret, version as "v1" | "v2"),
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
/** Bounded, repeatable migration. A conditional write prevents replacing a concurrently changed photo. */
export async function migratePhotoMetadataBatch(env: Env, cursor?: string) {
  if (!env.PHOTO_EVIDENCE_SECRET || !env.LEGACY_PHOTO_EVIDENCE_SECRET)
    throw new Error("Photo metadata migration keys are not configured");
  const list = await env.R2.list({ limit: 10, ...(cursor ? { cursor } : {}) });
  let migrated = 0,
    verified = 0,
    skipped = 0,
    failed = 0;
  for (const entry of list.objects) {
    try {
      const object = await env.R2.get(entry.key);
      if (!object) {
        skipped++;
        continue;
      }
      const sealed = object.customMetadata?.sigap_exif;
      if (!sealed) {
        skipped++;
        continue;
      }
      const metadata = await openPhotoMetadata(env, entry.key, sealed);
      if (sealed.startsWith("v2.")) {
        verified++;
        continue;
      }
      if (object.size > 10 * 1024 * 1024) {
        failed++;
        continue;
      }
      const result = await env.R2.put(entry.key, await object.arrayBuffer(), {
        ...(object.httpMetadata ? { httpMetadata: object.httpMetadata } : {}),
        customMetadata: {
          ...object.customMetadata,
          sigap_exif: await sealPhotoMetadata(env, entry.key, metadata),
        },
        onlyIf: { etagMatches: object.etag },
      });
      if (!result) {
        failed++;
        continue;
      }
      const updated = await env.R2.get(entry.key);
      if (!updated?.customMetadata?.sigap_exif?.startsWith("v2."))
        throw new Error("Migration verification failed");
      await openPhotoMetadata(
        env,
        entry.key,
        updated.customMetadata.sigap_exif,
      );
      migrated++;
    } catch {
      failed++;
    }
  }
  return {
    scanned: list.objects.length,
    migrated,
    verified,
    skipped,
    failed,
    cursor: list.truncated ? list.cursor : null,
    complete: !list.truncated,
  };
}
