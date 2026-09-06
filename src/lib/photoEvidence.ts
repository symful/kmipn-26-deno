import { extractExifFromBuffer } from "@/lib/agent/exif";
import type { Env } from "@/types/bindings";
import { sealPhotoMetadata } from "@/lib/photoMetadata";
import exifr from "exifr";
const LIMIT = 10 * 1024 * 1024;
export function validateOriginalPhoto(
  file: FormDataEntryValue | null,
): string | null {
  if (file === null) return null;
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    return "Original photo must be JPEG, PNG or WebP";
  return file.size > LIMIT ? "Original photo must not exceed 10 MB" : null;
}
// Remove EXIF containers without changing image pixels. Public bytes never carry GPS EXIF.
export function stripPhotoExif(buffer: ArrayBuffer, type: string): Uint8Array {
  const b = new Uint8Array(buffer);
  const parts: Uint8Array[] = [];
  if (type === "image/jpeg") {
    if (b[0] !== 255 || b[1] !== 216) throw new Error("Invalid JPEG");
    parts.push(b.slice(0, 2));
    let p = 2;
    while (p < b.length) {
      const start = p;
      if (b[p++] !== 255) throw new Error("Invalid JPEG segment");
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === undefined) throw new Error("Invalid JPEG marker");
      if (marker === 0xda || marker === 0xd9) {
        parts.push(b.slice(start));
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        parts.push(b.slice(start, p));
        continue;
      }
      if (p + 2 > b.length) throw new Error("Invalid JPEG length");
      const length = (b[p]! << 8) | b[p + 1]!;
      if (length < 2 || p + length > b.length)
        throw new Error("Invalid JPEG length");
      p += length;
      if (marker !== 0xe1) parts.push(b.slice(start, p));
    }
  } else if (type === "image/png") {
    if (b.length < 8 || b[0] !== 137 || b[1] !== 80)
      throw new Error("Invalid PNG");
    parts.push(b.slice(0, 8));
    let p = 8;
    const view = new DataView(buffer);
    while (p < b.length) {
      if (p + 12 > b.length) throw new Error("Invalid PNG chunk");
      const len = view.getUint32(p);
      const end = p + 12 + len;
      if (end > b.length) throw new Error("Invalid PNG length");
      const kind = String.fromCharCode(...b.slice(p + 4, p + 8));
      if (!["eXIf", "tEXt", "iTXt", "zTXt"].includes(kind))
        parts.push(b.slice(p, end));
      p = end;
    }
  } else if (type === "image/webp") {
    if (
      String.fromCharCode(...b.slice(0, 4)) !== "RIFF" ||
      String.fromCharCode(...b.slice(8, 12)) !== "WEBP"
    )
      throw new Error("Invalid WebP");
    parts.push(b.slice(0, 12));
    let p = 12;
    const view = new DataView(buffer);
    while (p < b.length) {
      if (p + 8 > b.length) throw new Error("Invalid WebP chunk");
      const len = view.getUint32(p + 4, true);
      const end = p + 8 + len + (len % 2);
      if (end > b.length) throw new Error("Invalid WebP length");
      const kind = String.fromCharCode(...b.slice(p, p + 4));
      if (kind !== "EXIF" && kind !== "XMP ") {
        const chunk = b.slice(p, end);
        if (kind === "VP8X") chunk[8] = (chunk[8] ?? 0) & ~(0x08 | 0x04);
        parts.push(chunk);
      }
      p = end;
    }
  } else throw new Error("Unsupported photo type");
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  if (type === "image/webp")
    new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}
export async function storeEvidencePhoto(
  env: Env,
  key: string,
  photo: File,
  original: File | null,
) {
  const publicInput = await photo.arrayBuffer();
  const evidence = original ? await original.arrayBuffer() : publicInput;
  const exif = await extractExifFromBuffer(evidence);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", evidence)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const metadata = {
    ...exif,
    source: original ? "uploaded_original_photo" : "uploaded_photo",
    original_sha256: digest,
  };
  let publicBytes = stripPhotoExif(publicInput, photo.type);
  // Preserve only the safe orientation tag when the client has not rotated pixels.
  // GPS, timestamp, device details and all other EXIF remain removed.
  if (photo.type === "image/jpeg") {
    const orientation = await exifr
      .orientation(publicInput)
      .catch(() => undefined);
    if (
      typeof orientation === "number" &&
      orientation >= 2 &&
      orientation <= 8
    ) {
      const segment = new Uint8Array([
        255,
        225,
        0,
        34,
        69,
        120,
        105,
        102,
        0,
        0,
        73,
        73,
        42,
        0,
        8,
        0,
        0,
        0,
        1,
        0,
        18,
        1,
        3,
        0,
        1,
        0,
        0,
        0,
        orientation,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]);
      const oriented = new Uint8Array(publicBytes.length + segment.length);
      oriented.set(publicBytes.slice(0, 2));
      oriented.set(segment, 2);
      oriented.set(publicBytes.slice(2), 2 + segment.length);
      publicBytes = oriented;
    }
  }
  await env.R2.put(key, publicBytes, {
    httpMetadata: { contentType: photo.type },
    customMetadata: { sigap_exif: await sealPhotoMetadata(env, key, metadata) },
  });
}
