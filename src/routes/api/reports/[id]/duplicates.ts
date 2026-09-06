import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";
import { findDuplicates } from "@/lib/agent/duplicates";

const DUPLICATE_RADIUS_METERS_DEFAULT = 500;
const DUPLICATE_LIMIT_DEFAULT = 10;

export const reportDuplicatesByIdRoute = new Hono<{ Bindings: Env }>();

reportDuplicatesByIdRoute.get(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json(
        { error: { code: "MISSING_ID", message: "Report ID is required" } },
        400,
      );
    }

    // Fetch the report to get lat, lng, category_id
    const reportRow = await c.env.D1.prepare(
      "SELECT id, lat, lng, category_id FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; lat: number; lng: number; category_id: string }>();

    if (!reportRow) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    const { lat, lng, category_id } = reportRow;
    const config = getConfig(
      c.env as unknown as Record<string, string | undefined>,
    );
    const DUPLICATE_RADIUS_METERS =
      config.DUPLICATE_RADIUS_METERS ?? DUPLICATE_RADIUS_METERS_DEFAULT;
    const limit = DUPLICATE_LIMIT_DEFAULT;

    const candidates = await findDuplicates(
      c.env,
      lng,
      lat,
      category_id,
      id, // exclude the report itself
      DUPLICATE_RADIUS_METERS,
      limit,
    );

    if (candidates.length === 0) {
      return c.json({ candidates: [] });
    }

    const candidateIds = candidates.map((c) => c.report_id);

    // Supplemental query: get status + photo_urls for each candidate
    const metaRows = await c.env.D1.prepare(
      `SELECT r.id, r.status, r.photo_urls, r.title, r.lat, r.lng, r.created_at,
       1 + (SELECT COUNT(*) FROM reports supporting WHERE supporting.merged_into = r.id) AS report_count
     FROM reports r
     WHERE id IN (${candidateIds.map(() => "?").join(",")})`,
    )
      .bind(...candidateIds)
      .all<{
        id: string;
        status: string;
        photo_urls: string;
        title: string | null;
        lat: number | null;
        lng: number | null;
        created_at: string;
        report_count: number;
      }>();

    const metaMap = new Map<
      string,
      {
        status: string;
        photo_url: string | null;
        title: string | null;
        lat: number | null;
        lng: number | null;
        created_at: string;
        report_count: number;
      }
    >();
    for (const row of metaRows.results ?? []) {
      const photoUrls = row.photo_urls ? JSON.parse(row.photo_urls) : [];
      metaMap.set(row.id, {
        status: row.status,
        photo_url: photoUrls?.[0] ?? null,
        title: row.title,
        lat: row.lat,
        lng: row.lng,
        created_at: row.created_at,
        report_count: row.report_count,
      });
    }

    // similarity_score = max(0, 1 - distance_m / (DUPLICATE_RADIUS_METERS * 2))
    // Normalizes to [0,1]: 0m → 1.0, radius → 0.5, 2*radius → 0
    const similarityScale = DUPLICATE_RADIUS_METERS * 2;

    const result = candidates.map((candidate) => {
      const meta = metaMap.get(candidate.report_id);
      const report_count = meta?.report_count ?? 1;
      const similarity_score = Math.max(
        0,
        1 - candidate.distance_m / similarityScale,
      );

      return {
        report_id: candidate.report_id,
        description: candidate.description,
        status: meta?.status ?? null,
        photo_url: meta?.photo_url ?? null,
        title: meta?.title ?? null,
        lat: meta?.lat ?? null,
        lng: meta?.lng ?? null,
        created_at: meta?.created_at ?? candidate.created_at.toISOString(),
        distance_m: Math.round(candidate.distance_m),
        report_count,
        similarity_score: Math.round(similarity_score * 100) / 100,
      };
    });

    return c.json({ candidates: result });
  }),
);
