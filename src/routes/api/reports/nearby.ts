import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { ReportsNearbyQuerySchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { normalizeReportPhotoUrls, normalizePhotoUrls } from "@/lib/photo-urls";

export const reportsNearbyRoute = new Hono<{ Bindings: Env }>();

/** Haversine distance between two lat/lng points in meters */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

reportsNearbyRoute.get(
  "/",
  safeHandler(async (c) => {
    const { lat, lng, radius, limit } = parseQuery(c, ReportsNearbyQuerySchema);

    const reports = async () => {
      const result = await c.env.D1.prepare(
        `SELECT r.id, r.category_id, r.status, r.created_at, r.lat, r.lng,
              r.title, r.description, r.photo_urls, r.kelurahan, r.address_area,
              c.name AS category_name,
              1 + (SELECT COUNT(*) FROM reports linked WHERE linked.merged_into = r.id) AS report_count
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?
         AND r.merged_into IS NULL
         AND r.status NOT IN ('draft', 'rejected', 'out_of_scope')
       ORDER BY r.created_at DESC
       LIMIT ?`,
      )
        .bind(
          lat - radius / 111000,
          lat + radius / 111000,
          lng - radius / (111000 * Math.cos((lat * Math.PI) / 180)),
          lng + radius / (111000 * Math.cos((lat * Math.PI) / 180)),
          limit,
        )
        .all<{
          id: string;
          category_id: string;
          status: string;
          created_at: string;
          lat: number;
          lng: number;
          title: string | null;
          description: string;
          photo_urls: unknown;
          kelurahan: string | null;
          address_area: string | null;
          category_name: string | null;
          report_count: number;
        }>();
      return (
        result.results
          ?.map((row) => {
            return {
              ...normalizeReportPhotoUrls(row),
              title: row.title || row.description,
              village: row.kelurahan,
              photo_url: normalizePhotoUrls(row.photo_urls)[0] ?? null,
              distance_m: haversineDistance(lat, lng, row.lat, row.lng),
            };
          })
          .filter((row) => row.distance_m <= radius)
          .sort((a, b) => a.distance_m - b.distance_m) ?? []
      );
    };

    return c.json({ reports: await reports() });
  }),
);
