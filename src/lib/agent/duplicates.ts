import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";

export interface DuplicateCandidate {
  report_id: string;
  distance_m: number;
  description: string;
  created_at: Date;
}

export async function findDuplicates(
  env: Env,
  lng: number,
  lat: number,
  categoryId: string,
  excludeReportId: string | undefined,
  radiusMeters: number,
  limit: number
): Promise<DuplicateCandidate[]> {
  return await withClient(env, async (c) => {
    const result = await c.query<{ id: string; distance_m: number; description: string; created_at: Date }>(
      `SELECT id, ST_Distance(geom, ST_MakePoint($1, $2)::geography) AS distance_m, description, created_at
       FROM reports
       WHERE category_id = $3
         AND ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, $4)
         AND ($5::uuid IS NULL OR id != $5)
       ORDER BY distance_m ASC
       LIMIT $6`,
      [lng, lat, categoryId, radiusMeters, excludeReportId ?? null, limit]
    );
    return result.rows.map((r) => ({
      report_id: r.id,
      distance_m: Number(r.distance_m),
      description: r.description,
      created_at: r.created_at,
    }));
  });
}
