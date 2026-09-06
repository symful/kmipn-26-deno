import { z } from "zod";
import { extractExif } from "@/lib/agent/exif";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import { getConfig } from "@/config/env";
import { dbId } from "@/lib/schemas";

export const locationTimeConsistencyInputSchema = z.object({
  report_id: dbId,
  photo_key: z.string(),
});

export const locationTimeConsistencyOutputSchema = z.object({
  consistent: z.boolean(),
  authenticity_score: z.number().min(0).max(100).nullable(),
  authenticity_label: z.string(),
  exif_gps: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  exif_timestamp: z.string().nullable(),
  distance_meters: z.number().nullable(),
  time_delta_hours: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
  evidence_source: z.string().optional(),
  original_sha256: z.string().optional(),
});

export type LocationTimeConsistencyInput = z.infer<
  typeof locationTimeConsistencyInputSchema
>;
export type LocationTimeConsistencyOutput = z.infer<
  typeof locationTimeConsistencyOutputSchema
>;

const locationTimeConsistencyTool = {
  name: "assess_location_time_consistency",
  description:
    "Checks consistency between photo EXIF GPS/timestamp and reported location/time. Detects potential GPS spoofing.",
  model: null as "vision" | "text" | "both" | null,
  inputSchema: locationTimeConsistencyInputSchema,
  outputSchema: locationTimeConsistencyOutputSchema,

  promptBuilder: (): string => {
    return "This tool is pure code - no LLM prompt needed";
  },

  execute: async (
    env: Env,
    input: LocationTimeConsistencyInput,
  ): Promise<LocationTimeConsistencyOutput> => {
    try {
      const config = getConfig(
        env as unknown as Record<string, string | undefined>,
      );
      const LOCATION_TOLERANCE_METERS = config.LOCATION_TOLERANCE_METERS ?? 100;
      const TIME_TOLERANCE_HOURS = config.TIME_TOLERANCE_HOURS ?? 24;

      const [exifResult, reportMeta] = await Promise.all([
        extractExif(env, input.photo_key),
        env.D1.prepare(`SELECT lat, lng, reported_at FROM reports WHERE id = ?`)
          .bind(input.report_id)
          .first(),
      ]);

      if (!reportMeta) {
        return {
          consistent: false,
          authenticity_score: null,
          authenticity_label: "Laporan tidak ditemukan",
          exif_gps: null,
          exif_timestamp: null,
          distance_meters: null,
          time_delta_hours: null,
          confidence: 0,
          supporting_factors: [],
          risk_factors: ["report_not_found"],
          correlation_ids: [input.report_id],
        };
      }

      const supporting_factors: string[] = [];
      const risk_factors: string[] = [];
      let distance_meters: number | null = null;
      let time_delta_hours: number | null = null;
      let location_match = false;
      let time_match = false;
      let hasData = false;

      const exif_gps =
        exifResult.valid && exifResult.gps
          ? { lat: exifResult.gps.lat, lng: exifResult.gps.lng }
          : null;
      const exif_timestamp =
        exifResult.valid && exifResult.timestamp ? exifResult.timestamp : null;

      if (
        exifResult.valid &&
        exifResult.gps &&
        typeof reportMeta.lat === "number" &&
        typeof reportMeta.lng === "number"
      ) {
        hasData = true;
        const gps_lat = exifResult.gps.lat as number;
        const gps_lng = exifResult.gps.lng as number;
        const reported_lat = reportMeta.lat as number;
        const reported_lng = reportMeta.lng as number;

        distance_meters = haversineDistance(
          gps_lat,
          gps_lng,
          reported_lat,
          reported_lng,
        );
        location_match = distance_meters <= LOCATION_TOLERANCE_METERS;

        if (location_match) {
          supporting_factors.push("location_match");
        } else {
          risk_factors.push(
            `Lokasi foto berjarak ${Math.round(distance_meters)} meter dari titik laporan, melebihi batas ${LOCATION_TOLERANCE_METERS} meter.`,
          );
        }
      } else {
        risk_factors.push(exifResult.reason ?? "no_gps_data");
      }

      if (
        exifResult.valid &&
        exifResult.timestamp &&
        Number.isFinite(Date.parse(reportMeta.reported_at as string))
      ) {
        hasData = true;
        const gps_time = new Date(exifResult.timestamp as string).getTime();
        const reported_time = new Date(
          reportMeta.reported_at as string,
        ).getTime();
        time_delta_hours =
          Math.abs(gps_time - reported_time) / (1000 * 60 * 60);
        time_match = time_delta_hours <= TIME_TOLERANCE_HOURS;

        if (time_match) {
          supporting_factors.push("time_match");
        } else {
          risk_factors.push(
            `Waktu foto berbeda ${time_delta_hours.toFixed(1)} jam dari waktu laporan, melebihi batas ${TIME_TOLERANCE_HOURS} jam.`,
          );
        }
      } else if (exifResult.valid && !exifResult.timestamp) {
        risk_factors.push("no_timestamp_in_exif");
      }

      const consistent =
        distance_meters !== null &&
        time_delta_hours !== null &&
        location_match &&
        time_match;
      const confidence = hasData ? (consistent ? 1.0 : 0.5) : 0.0;

      let authenticity_score: number | null;
      let authenticity_label: string;

      if (distance_meters === null || time_delta_hours === null) {
        authenticity_score = null;
        authenticity_label =
          distance_meters === null && time_delta_hours === null
            ? "Lokasi dan waktu foto belum dapat dibandingkan"
            : distance_meters === null
              ? "Lokasi pengambilan foto belum dapat dibandingkan"
              : "Waktu pengambilan foto belum dapat dibandingkan";
      } else if (consistent) {
        authenticity_score = 95;
        authenticity_label = "Lokasi dan waktu foto sesuai dengan laporan";
      } else {
        const distancePenalty = Math.min(60, distance_meters / 5);
        const timePenalty = Math.min(20, time_delta_hours * 2);
        authenticity_score = Math.max(
          10,
          Math.round(95 - distancePenalty - timePenalty),
        );

        if (!location_match && !time_match) {
          authenticity_label = "Lokasi dan waktu foto berbeda dari laporan";
        } else if (!location_match) {
          authenticity_label = "Lokasi foto berbeda dari lokasi laporan";
        } else {
          authenticity_label = "Waktu foto berbeda dari waktu laporan";
        }
      }

      if (consistent) {
        supporting_factors.push("location_time_consistent");
      }

      const result = {
        evidence_source: exifResult.source ?? "stored_photo_exif",
        ...(exifResult.original_sha256
          ? { original_sha256: exifResult.original_sha256 }
          : {}),
        consistent,
        authenticity_score,
        authenticity_label,
        exif_gps,
        exif_timestamp,
        distance_meters,
        time_delta_hours,
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids: [input.report_id],
      };

      await saveAssessment(env, {
        tool_name: "assess_location_time_consistency",
        report_id: input.report_id,
        model_version: "rules-v1",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids: [input.report_id],
        idempotency_key: `assess_location_time_consistency_${input.report_id}_${crypto.randomUUID()}`,
        status: "completed",
        result,
      });

      return result;
    } catch (e) {
      return {
        consistent: false,
        authenticity_score: null,
        authenticity_label: "Data lokasi dan waktu foto belum berhasil dibaca",
        exif_gps: null,
        exif_timestamp: null,
        distance_meters: null,
        time_delta_hours: null,
        confidence: 0,
        supporting_factors: [],
        risk_factors: [(e as Error).message],
        correlation_ids: [input.report_id],
      };
    }
  },
};

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export default locationTimeConsistencyTool;
