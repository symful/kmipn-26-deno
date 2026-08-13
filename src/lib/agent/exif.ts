import exifr from "exifr";
import { fetchFromR2 } from "@/lib/r2";
import type { Env } from "@/types/bindings";

export interface ExifData {
  valid: boolean;
  reason?: string;
  gps?: { lat: number; lng: number };
  timestamp?: string;
  camera?: string;
  software?: string;
}

export async function extractExif(env: Env, photoKey: string): Promise<ExifData> {
  try {
    const buf = await fetchFromR2(env, photoKey);
    if (!buf) return { valid: false, reason: "photo_not_found" };
    const data = await exifr.parse(buf, { gps: true, pick: ["GPSLatitude", "GPSLongitude", "DateTimeOriginal", "Make", "Model", "Software"] });
    if (!data) return { valid: false, reason: "no_exif_data" };
    const result: ExifData = { valid: true };
    if (data.latitude != null && data.longitude != null) {
      result.gps = { lat: data.latitude, lng: data.longitude };
    }
    if (data.DateTimeOriginal) {
      result.timestamp = new Date(data.DateTimeOriginal).toISOString();
    }
    const camera = [data.Make, data.Model].filter(Boolean).join(" ");
    if (camera) result.camera = camera;
    if (data.Software) result.software = data.Software;
    return result;
  } catch (e) {
    return { valid: false, reason: (e as Error).message };
  }
}
