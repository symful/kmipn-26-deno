import { z } from "zod";
import { extractExif } from "@/lib/agent/exif";
import { withClient } from "@/lib/db";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import { getConfig } from "@/config/env";

export const locationTimeConsistencyInputSchema = z.object({
  report_id: z.string().uuid(),
  photo_key: z.string(),
});

export const locationTimeConsistencyOutputSchema = z.object({
  consistent: z.boolean(),
  distance_meters: z.number(),
  time_delta_hours: z.number(),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
});

export type LocationTimeConsistencyInput = z.infer<typeof locationTimeConsistencyInputSchema>;
export type LocationTimeConsistencyOutput = z.infer<typeof locationTimeConsistencyOutputSchema>;

const locationTimeConsistencyTool = {
  name: "assess_location_time_consistency",
  description: "Checks consistency between photo EXIF GPS/timestamp and reported location/time. Detects potential GPS spoofing.",
  model: null as "vision" | "text" | "both" | null,
  inputSchema: locationTimeConsistencyInputSchema,
  outputSchema: locationTimeConsistencyOutputSchema,

  promptBuilder: (): string => {
    return "This tool is pure code - no LLM prompt needed";
  },

  execute: async (env: Env, input: LocationTimeConsistencyInput): Promise<LocationTimeConsistencyOutput> => {
    try {
      const config = getConfig(env as unknown as Record<string, string | undefined>);
      const LOCATION_TOLERANCE_METERS = config.LOCATION_TOLERANCE_METERS ?? 100;
      const TIME_TOLERANCE_HOURS = config.TIME_TOLERANCE_HOURS ?? 24;

      const [exifResult, reportMeta] = await Promise.all([
        extractExif(env, input.photo_key),
        withClient(env, async (client) => {
          const result = await client.query<{
            lng: number;
            lat: number;
            reported_at: string;
          }>(
            `SELECT ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat, reported_at
             FROM reports WHERE id = $1`,
            [input.report_id]
          );
          return result.rows[0];
        }),
      ]);

      if (!reportMeta) {
        return {
          consistent: false,
          distance_meters: 0,
          time_delta_hours: 0,
          confidence: 0,
          supporting_factors: [],
          risk_factors: ["report_not_found"],
          correlation_ids: [input.report_id],
        };
      }

      const supporting_factors: string[] = [];
      const risk_factors: string[] = [];
      let distance_meters = 0;
      let time_delta_hours = 0;
      let location_match = false;
      let time_match = false;
      let hasData = false;

      if (exifResult.valid && exifResult.gps) {
        hasData = true;
        const gps_lat = exifResult.gps.lat;
        const gps_lng = exifResult.gps.lng;
        const reported_lat = reportMeta.lat;
        const reported_lng = reportMeta.lng;

        distance_meters = haversineDistance(gps_lat, gps_lng, reported_lat, reported_lng);
        location_match = distance_meters <= LOCATION_TOLERANCE_METERS;

        if (location_match) {
          supporting_factors.push("location_match");
        } else {
          risk_factors.push(`GPS location differs by ${Math.round(distance_meters)}m (tolerance: ${LOCATION_TOLERANCE_METERS}m)`);
        }
      } else {
        risk_factors.push(exifResult.reason ?? "no_gps_data");
      }

      if (exifResult.valid && exifResult.timestamp) {
        hasData = true;
        const gps_time = new Date(exifResult.timestamp).getTime();
        const reported_time = new Date(reportMeta.reported_at).getTime();
        time_delta_hours = Math.abs(gps_time - reported_time) / (1000 * 60 * 60);
        time_match = time_delta_hours <= TIME_TOLERANCE_HOURS;

        if (time_match) {
          supporting_factors.push("time_match");
        } else {
          risk_factors.push(`Timestamp differs by ${time_delta_hours.toFixed(1)}h (tolerance: ${TIME_TOLERANCE_HOURS}h)`);
        }
      } else if (exifResult.valid && !exifResult.timestamp) {
        risk_factors.push("no_timestamp_in_exif");
      }

      const consistent = hasData && risk_factors.length === 0;
      const confidence = hasData ? (consistent ? 1.0 : 0.5) : 0.0;

      if (consistent) {
        supporting_factors.push("location_time_consistent");
      }

      const result = {
        consistent,
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
        model_version: "1.0.0",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids: [input.report_id],
        idempotency_key: `assess_location_time_consistency_${input.report_id}_${crypto.randomUUID()}`,
        status: consistent ? "consistent" : "inconsistent",
        result,
      });

      return result;
    } catch (e) {
      return {
        consistent: false,
        distance_meters: 0,
        time_delta_hours: 0,
        confidence: 0,
        supporting_factors: [],
        risk_factors: [(e as Error).message],
        correlation_ids: [input.report_id],
      };
    }
  },
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export default locationTimeConsistencyTool;
