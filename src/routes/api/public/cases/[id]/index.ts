import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

export const publicCasesRoute = new Hono<{ Bindings: Env }>();

publicCasesRoute.get(
  "/:id",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT r.id, r.category_id, r.status, r.created_at, r.updated_at,
                r.photo_urls, r.title, r.description,
                COALESCE(kab.name, 'Unknown') AS general_wilayah,
                COALESCE(ST_X(ST_Centroid(kab.geom)), r.lng) AS kabupaten_lng,
                COALESCE(ST_Y(ST_Centroid(kab.geom)), r.lat) AS kabupaten_lat
         FROM reports r
         LEFT JOIN wilayah kab ON kab.level = 'KABUPATEN'
           AND kab.geom IS NOT NULL
           AND ST_Contains(kab.geom, r.geom::geometry)
         WHERE r.id = $1`,
        [id]
      );
      return r.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, 404);
    }

    const shareToken = await withClient(c.env, async (client: PgClient) => {
      const tokenResult = await client.query(
        `SELECT share_token FROM report_shares
         WHERE report_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      return tokenResult.rows[0]?.share_token ?? null;
    });

    const publicProgress = getPublicProgress(result.status);
    const moderatedPhotoUrl = result.photo_urls?.[0] ?? null;
    const generalizedLocation = generalizeLocation(
      Number(result.kabupaten_lat),
      Number(result.kabupaten_lng)
    );

    return c.json({
      id: result.id,
      category_id: result.category_id,
      general_wilayah: result.general_wilayah,
      status: result.status,
      last_updated: result.updated_at ?? result.created_at,
      public_progress: publicProgress,
      moderated_photo_url: moderatedPhotoUrl,
      share_token: shareToken,
      generalized_location: generalizedLocation,
      title: result.title,
      description: String(result.description ?? "").slice(0, 200),
    });
  }),
);

function getPublicProgress(status: string): number {
  const progressMap: Record<string, number> = {
    draft: 0,
    submitted: 10,
    under_review: 30,
    verified: 50,
    assigned: 60,
    in_progress: 75,
    resolved: 100,
    closed: 100,
    rejected: 0,
    duplicate_merged: 100,
    needs_survey: 40,
  };
  return progressMap[status] ?? 0;
}

function generalizeLocation(
  lat: number,
  lng: number
): { lat: number; lng: number } {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { lat: 0, lng: 0 };
  }
  const maxOffsetKm = 5;
  const latOffset = (Math.random() - 0.5) * 2 * (maxOffsetKm / 111);
  const lngOffset = (Math.random() - 0.5) * 2 * (maxOffsetKm / (111 * Math.cos((lat * Math.PI) / 180)));
  return {
    lat: Math.round((lat + latOffset) * 1000000) / 1000000,
    lng: Math.round((lng + lngOffset) * 1000000) / 1000000,
  };
}
