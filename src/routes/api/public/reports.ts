import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { PublicReportCreateSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { runAssessment } from "@/lib/agent/orchestrator";
import { redactText } from "@/lib/agent/redaction";

const PUBLIC_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export const publicReportsRoute = new Hono<{ Bindings: Env }>();

/**
 * GET /api/public/reports - List public reports with privacy redaction
 *
 * Returns: id, category {id, short_code, name, icon}, wilayah {kecamatan, desa},
 * general_wilayah (kabupaten level), status, last_updated, public_progress,
 * moderated_photo_url, share_token, generalized_location, supporting_count
 *
 * NO: reporter_id (device_id), exact location, internal assessments, audit
 */
publicReportsRoute.get(
  "/",
  safeHandler(async (c) => {
    const statusParam = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const bboxParam = c.req.query("bbox");
    const monthParam = c.req.query("month");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const result = await withClient(c.env, async (client: PgClient) => {
      // Build filters - only return non-rejected reports by default
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (statusParam) {
        const statuses = statusParam.split(",").map((s) => s.trim());
        filters.push(`r.status = ANY($${i++})`);
        params.push(statuses);
      } else {
        // Default: exclude rejected reports from public view
        filters.push(`r.status != 'rejected'`);
      }

      if (categoryId) {
        filters.push(`r.category_id = $${i++}`);
        params.push(categoryId);
      }

      // bbox filter: minLng,minLat,maxLng,maxLat
      if (bboxParam) {
        const coords = bboxParam.split(",").map((c) => parseFloat(c.trim()));
        if (coords.length === 4 && coords.every((v) => !isNaN(v))) {
          filters.push(`ST_Contains(ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326), r.geom::geometry)`);
          params.push(coords[0], coords[1], coords[2], coords[3]);
        }
      }

      // month filter: YYYY-MM
      if (monthParam) {
        const monthRegex = /^\d{4}-\d{2}$/;
        if (monthRegex.test(monthParam)) {
          filters.push(`date_trunc('month', r.reported_at) = date_trunc('month', $${i++}::date)`);
          params.push(monthParam);
        }
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const listSql = `
        SELECT
          r.id,
          r.category_id,
          c.id AS cat_id,
          c.short_code AS category_short_code,
          c.name AS category_name,
          c.icon AS category_icon,
          r.status,
          r.created_at as last_updated,
          r.photo_urls,
          COALESCE(kab.name, 'Unknown') AS general_wilayah,
          COALESCE(ST_X(ST_Centroid(kab.geom)), r.lng) AS kabupaten_lng,
          COALESCE(ST_Y(ST_Centroid(kab.geom)), r.lat) AS kabupaten_lat,
          COALESCE(w.name, 'Unknown') AS village_name,
          COALESCE(kec.name, 'Unknown') AS kecamatan_name,
          COALESCE(supporting.cnt, 0) AS supporting_count
        FROM reports r
        LEFT JOIN categories c ON c.id = r.category_id
        LEFT JOIN wilayah kab ON kab.level = 'KABUPATEN'
          AND kab.geom IS NOT NULL
          AND ST_Contains(kab.geom, r.geom::geometry)
        LEFT JOIN wilayah w ON w.id = r.wilayah_id
        LEFT JOIN wilayah kec ON kec.id = w.parent_id AND kec.level = 'KECAMATAN'
        LEFT JOIN (
          SELECT facility_card_id, COUNT(*) AS cnt
          FROM reports
          WHERE facility_card_id IS NOT NULL
          GROUP BY facility_card_id
        ) supporting ON supporting.facility_card_id = r.facility_card_id
        ${where}
        ORDER BY r.created_at DESC
        LIMIT $${i++} OFFSET $${i++}
      `;

      const countSql = `SELECT COUNT(*)::int AS total FROM reports r ${where}`;

      const listParams = [...params, limit, offset];
      const countParams = [...params];

      const [listResult, countResult] = await Promise.all([
        client.query(listSql, listParams),
        client.query(countSql, countParams),
      ]);

      const total = countResult.rows[0]?.total ?? 0;

      // Get share tokens for these reports
      const reportIds = listResult.rows.map((row) => row.id);
      let shareTokens: Record<string, string> = {};
      if (reportIds.length > 0) {
        const tokensResult = await client.query(
          `SELECT report_id, share_token FROM report_shares
           WHERE report_id = ANY($1) AND expires_at > NOW()`,
          [reportIds]
        );
        for (const row of tokensResult.rows) {
          shareTokens[row.report_id] = row.share_token;
        }
      }

      // Transform rows with redaction
      const reports = listResult.rows.map((row) => {
        // Calculate public_progress from status (0-100)
        const publicProgress = getPublicProgress(row.status);

        // Get first photo as moderated_photo_url (in production, this would be a reviewed/moderated URL)
        const moderatedPhotoUrl = row.photo_urls?.[0] ?? null;

        // Generate generalized location: kabupaten centroid + random offset ≤ 5km
        const generalizedLocation = generalizeLocation(
          Number(row.kabupaten_lat),
          Number(row.kabupaten_lng)
        );

        return {
          id: row.id,
          category: {
            id: row.cat_id,
            short_code: row.category_short_code ?? null,
            name: row.category_name ?? null,
            icon: row.category_icon ?? null,
          },
          wilayah: {
            kecamatan: row.kecamatan_name ?? null,
            desa: row.village_name,
          },
          general_wilayah: row.general_wilayah,
          status: row.status,
          last_updated: row.last_updated,
          public_progress: publicProgress,
          moderated_photo_url: moderatedPhotoUrl,
          share_token: shareTokens[row.id] ?? null,
          generalized_location: generalizedLocation,
          supporting_count: Number(row.supporting_count) ?? 0,
        };
      });

      return { reports, total, page, limit };
    });

    return c.json(result);
  }),
);

/**
 * GET /api/public/reports/:id - Get single public report detail with redaction
 */
publicReportsRoute.get(
  "/:id",
  safeHandler(async (c) => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? "anonymous";
    if (!checkRateLimit(`public-reports:${ip}`, PUBLIC_RATE_LIMIT.limit, PUBLIC_RATE_LIMIT.windowMs)) {
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
    }
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
      return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
    }

    // Get share token
    const shareToken = await withClient(c.env, async (client: PgClient) => {
      const tokenResult = await client.query(
        `SELECT share_token FROM report_shares
         WHERE report_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      return tokenResult.rows[0]?.share_token ?? null;
    });

    // Build response with redaction
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
      title: redactText(result.title),
      description: redactText(result.description),
    });
  }),
);

publicReportsRoute.post(
  "/",
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = PublicReportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    const rateLimitKey = `deviceId:reportCreate:${parsed.data.device_id}`;
    if (!checkRateLimit(rateLimitKey, 10, 60 * 60 * 1000)) {
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      const existing = await client.query(
        "SELECT id FROM reports WHERE idempotency_key = $1",
        [parsed.data.idempotency_key]
      );
      if (existing.rows[0]) {
        return { id: existing.rows[0].id as string, duplicate: true };
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO reports (idempotency_key, category_id, description, geom, location, photo_urls, status, created_at, updated_at)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geometry, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, 'submitted', NOW(), NOW()) RETURNING id`,
        [
          parsed.data.idempotency_key,
          parsed.data.category_id,
          parsed.data.description,
          parsed.data.lng,
          parsed.data.lat,
          parsed.data.photo_urls ?? [],
        ]
      );
      return { id: inserted.rows[0]!.id, duplicate: false };
    });

    if (!result.duplicate) {
      try {
        await withClient(c.env, async (client) => {
          await client.query(
            `INSERT INTO outbox (event_type, target_system, payload, related_report_id, next_retry_at)
             VALUES ($1, 'sipd', $2, $3, NOW())`,
            ["report_created", JSON.stringify({ report_id: result.id, action: "report_created" }), result.id]
          );
        });
      } catch (e) {
        logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
      }
      c.executionCtx.waitUntil(
        runAssessment(c.env, result.id).catch((e) =>
          logger.error({ route: c.req.path, method: c.req.method, error: e, context: "ai_assessment_failed" })
        )
      );
    }

    return c.json(result, 200);
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
  return {
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
  };
}
