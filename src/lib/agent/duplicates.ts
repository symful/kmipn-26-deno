import type { Env } from "@/types/bindings";

export interface DuplicateCandidate {
  report_id: string;
  distance_m: number;
  description: string;
  created_at: Date;
}

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

export async function findDuplicates(
  env: Env,
  lng: number,
  lat: number,
  categoryId: string,
  excludeReportId: string | undefined,
  radiusMeters: number,
  limit: number,
): Promise<DuplicateCandidate[]> {
  // Bounding-box pre-filter in SQL, precise haversine in JS
  const latDelta = radiusMeters / 111000;
  const lngDelta = radiusMeters / (111000 * Math.cos(toRad(lat)));

  const rows = await env.D1.prepare(
    `SELECT id, lat, lng, description, created_at
     FROM reports
     WHERE category_id = ?
       AND (? IS NULL OR id != ?)
       AND lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?`,
  )
    .bind(
      categoryId,
      excludeReportId ?? null,
      excludeReportId ?? null,
      lat - latDelta,
      lat + latDelta,
      lng - lngDelta,
      lng + lngDelta,
    )
    .all<{
      id: string;
      lat: number;
      lng: number;
      description: string;
      created_at: string;
    }>();

  const candidates = (rows.results ?? [])
    .map((r) => {
      const distance_m = haversineDistance(lat, lng, r.lat ?? 0, r.lng ?? 0);
      return { ...r, distance_m };
    })
    .filter((r) => r.distance_m <= radiusMeters)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);

  return candidates.map((r) => ({
    report_id: r.id,
    distance_m: r.distance_m,
    description: r.description,
    created_at: new Date(r.created_at),
  }));
}
