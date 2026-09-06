import exifr from "exifr";
import type { Env } from "@/types/bindings";
import { openPhotoMetadata } from "@/lib/photoMetadata";

export interface ExifData {
  valid: boolean;
  reason?: string;
  gps?: { lat: number; lng: number };
  timestamp?: string;
  camera?: string;
  software?: string;
  source?: string;
  original_sha256?: string;
}

export async function extractExif(
  env: Env,
  photoKey: string,
): Promise<ExifData> {
  try {
    const object = await env.R2.get(photoKey);
    if (!object) return { valid: false, reason: "photo_not_found" };
    if (object.customMetadata?.sigap_exif)
      return (await openPhotoMetadata(
        env,
        photoKey,
        object.customMetadata.sigap_exif,
      )) as ExifData;
    return await extractExifFromBuffer(await object.arrayBuffer());
  } catch (e) {
    return { valid: false, reason: (e as Error).message };
  }
}

export async function extractExifFromBuffer(
  buf: ArrayBuffer,
): Promise<ExifData> {
  try {
    const data = await exifr.parse(buf, {
      gps: true,
      reviveValues: false,
      pick: [
        "GPSLatitude",
        "GPSLatitudeRef",
        "GPSLongitude",
        "GPSLongitudeRef",
        "DateTimeOriginal",
        "OffsetTimeOriginal",
        "Make",
        "Model",
        "Software",
      ],
    });
    if (!data) return { valid: false, reason: "no_exif_data" };
    const result: ExifData = { valid: true };
    if (
      Number.isFinite(data.latitude) &&
      Number.isFinite(data.longitude) &&
      Math.abs(data.latitude) <= 90 &&
      Math.abs(data.longitude) <= 180 &&
      !(
        data.latitude === 0 &&
        data.longitude === 0 &&
        (!["N", "S"].includes(data.GPSLatitudeRef) ||
          !["E", "W"].includes(data.GPSLongitudeRef))
      )
    ) {
      result.gps = { lat: data.latitude, lng: data.longitude };
    } else if (data.latitude != null || data.longitude != null) {
      result.reason = "gps_metadata_unavailable_or_invalid";
    }
    if (data.DateTimeOriginal) {
      const wallTime =
        typeof data.DateTimeOriginal === "string"
          ? data.DateTimeOriginal.trim()
          : "";
      const offset =
        typeof data.OffsetTimeOriginal === "string"
          ? data.OffsetTimeOriginal.trim()
          : "";
      const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
        wallTime,
      );
      if (
        match &&
        /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) &&
        ((!offset.startsWith("+14:") && !offset.startsWith("-14:")) ||
          offset.endsWith(":00"))
      ) {
        const localIso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
        const date = new Date(localIso + offset);
        const wallDate = new Date(localIso + "Z");
        if (
          Number.isFinite(date.getTime()) &&
          Number.isFinite(wallDate.getTime()) &&
          wallDate.toISOString().slice(0, 19) === localIso
        )
          result.timestamp = date.toISOString();
        else result.reason = "timestamp_metadata_invalid";
      } else
        result.reason = offset
          ? "timestamp_metadata_invalid"
          : "timestamp_timezone_unavailable";
    }
    const camera = [data.Make, data.Model].filter(Boolean).join(" ");
    if (camera) result.camera = camera;
    if (data.Software) result.software = data.Software;
    return result;
  } catch (e) {
    return { valid: false, reason: (e as Error).message };
  }
}
