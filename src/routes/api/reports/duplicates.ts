import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { ReportsDuplicatesQuerySchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { getConfig } from "@/config/env";
import { findDuplicates } from "@/lib/agent/duplicates";

export const reportsDuplicatesRoute = new Hono<{ Bindings: Env }>();

reportsDuplicatesRoute.get(
  "/",
  safeHandler(async (c) => {
    const { lat, lng, category_id, radius, limit } = parseQuery(
      c,
      ReportsDuplicatesQuerySchema,
    );

    const DUPLICATE_RADIUS_METERS = getConfig(
      c.env as unknown as Record<string, string | undefined>,
    ).DUPLICATE_RADIUS_METERS;

    const candidates = await findDuplicates(
      c.env,
      lng,
      lat,
      category_id,
      undefined,
      DUPLICATE_RADIUS_METERS,
      limit,
    );

    if (candidates.length === 0) {
      return c.json({ data: [] });
    }

    const candidateIds = candidates.map((c) => c.report_id);

    // Supplemental query: get status + photo_urls for each candidate
    // (findDuplicates returns distance_m/description but not these fields)
    const metaRows = await c.env.D1.prepare(
      `SELECT id, status, photo_urls
     FROM reports
     WHERE id IN (${candidateIds.map(() => "?").join(",")})`,
    )
      .bind(...candidateIds)
      .all<{ id: string; status: string; photo_urls: string }>();

    const metaMap = new Map<
      string,
      { status: string; photo_url: string | null }
    >();
    for (const row of metaRows.results ?? []) {
      const photoUrls = row.photo_urls ? JSON.parse(row.photo_urls) : [];
      metaMap.set(row.id, {
        status: row.status,
        photo_url: photoUrls?.[0] ?? null,
      });
    }

    // report_count: single grouped query counting other reports within DUPLICATE_RADIUS_METERS
    // of each candidate sharing the same category (excludes the candidate itself).
    // Bounding-box pre-filter in SQL + haversine in JS for precision.
    const latDelta = DUPLICATE_RADIUS_METERS / 111000;
    const lngDelta =
      DUPLICATE_RADIUS_METERS / (111000 * Math.cos((lat * Math.PI) / 180));

    const countRows = await c.env.D1.prepare(
      `SELECT r.id as report_id, COUNT(*) - 1 as report_count
     FROM reports r
     WHERE r.category_id = ?
       AND r.lat BETWEEN ? AND ?
       AND r.lng BETWEEN ? AND ?
       AND r.id IN (${candidateIds.map(() => "?").join(",")})
     GROUP BY r.id`,
    )
      .bind(
        category_id,
        lat - latDelta,
        lat + latDelta,
        lng - lngDelta,
        lng + lngDelta,
        ...candidateIds,
      )
      .all<{ report_id: string; report_count: number }>();

    const countMap = new Map<string, number>();
    for (const row of countRows.results ?? []) {
      countMap.set(row.report_id, row.report_count);
    }

    // similarity_score = max(0, 1 - distance_m / (DUPLICATE_RADIUS_METERS * 2))
    // Normalizes to [0,1]: 0m → 1.0, radius → 0.5, 2*radius → 0
    const similarityScale = DUPLICATE_RADIUS_METERS * 2;

    const result = candidates.map((candidate) => {
      const meta = metaMap.get(candidate.report_id);
      const report_count = countMap.get(candidate.report_id) ?? 0;
      const similarity_score = Math.max(
        0,
        1 - candidate.distance_m / similarityScale,
      );

      return {
        report_id: candidate.report_id,
        description: candidate.description,
        status: meta?.status ?? null,
        photo_url: meta?.photo_url ?? null,
        distance_m: Math.round(candidate.distance_m),
        report_count,
        similarity_score: Math.round(similarity_score * 100) / 100,
      };
    });

    return c.json({ data: result });
  }),
);
