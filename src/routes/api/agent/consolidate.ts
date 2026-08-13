import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getConfig } from "@/config/env";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const agentConsolidateRoute = new Hono<{ Bindings: Env }>();

agentConsolidateRoute.post(
  "/",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN"),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const reportId = String(body.report_id ?? "").trim();

    if (!reportId || !UUID_REGEX.test(reportId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid report_id UUID is required" } }, 400);
    }

    const duplicateRadius = getConfig(c.env as unknown as Record<string, string | undefined>).DUPLICATE_RADIUS_METERS;

    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const reportR = await client.query<{
          id: string;
          category_id: string;
          lng: number;
          lat: number;
          facility_card_id: string | null;
          facility_card: unknown;
        }>(
          `SELECT id, category_id, ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat,
                  facility_card_id, facility_card
           FROM reports WHERE id = $1`,
          [reportId]
        );

        if (!reportR.rows[0]) {
          await client.query("ROLLBACK");
          return { error: "not_found" as const, message: "Report not found" };
        }

        const report = reportR.rows[0];

        if (report.facility_card_id) {
          await client.query("COMMIT");
          return { facility_card_id: report.facility_card_id, action: "already_linked" as const };
        }

        const nearbyR = await client.query<{ id: string }>(
          `SELECT r.id FROM reports r
           WHERE r.category_id = $1
             AND r.id != $2
             AND r.facility_card_id IS NULL
             AND r.status NOT IN ('rejected', 'duplicate_merged')
             AND ST_DWithin(
               r.geom,
               ST_MakePoint($3, $4)::geography,
               $5
             )
           ORDER BY r.created_at ASC
           LIMIT 10`,
          [report.category_id, reportId, report.lng, report.lat, duplicateRadius]
        );

        const nearbyIds = nearbyR.rows.map((r) => r.id);

        const allReportIds = [reportId, ...nearbyIds];

        // Collect photo_urls from all reports being consolidated and extract R2 keys
        const photoUrlsR = await client.query<{ photo_urls: string[] | null }>(
          `SELECT id, photo_urls FROM reports WHERE id = ANY($1)`,
          [allReportIds]
        );

        const photoKeys: string[] = [];
        for (const row of photoUrlsR.rows) {
          const urls = row.photo_urls ?? [];
          for (const url of urls) {
            // Extract R2 key from URL: https://media.sigap.live/reports/uuid/filename → reports/uuid/filename
            const match = url.match(/^https?:\/\/[^/]+\/(reports\/[a-f0-9-]+\/[a-z0-9._-]+)$/);
            if (match) {
              const key = match[1];
              if (key) photoKeys.push(key);
            }
          }
        }

        const existingCardR = await client.query<{ id: string; photo_keys: string[] | null }>(
          `SELECT fc.id, fc.photo_keys FROM facility_cards fc
           JOIN reports r ON r.facility_card_id = fc.id
           WHERE r.id = ANY($1)
           LIMIT 1`,
          [allReportIds]
        );

        let facilityCardId: string;

        if (existingCardR.rows[0]) {
          facilityCardId = existingCardR.rows[0].id;
          // Merge new photo_keys with existing ones
          const existingKeys = existingCardR.rows[0].photo_keys ?? [];
          const mergedKeys = [...new Set([...existingKeys, ...photoKeys])];
          await client.query(
            `UPDATE facility_cards SET photo_keys = $1, updated_at = NOW() WHERE id = $2`,
            [mergedKeys, facilityCardId]
          );
        } else {
          const facilityCardR = await client.query<{ id: string }>(
            `INSERT INTO facility_cards (primary_report_id, category_id, location, status, photo_keys)
             VALUES ($1, $2, ST_MakePoint($3, $4)::geography, 'active', $5)
             RETURNING id`,
            [reportId, report.category_id, report.lng, report.lat, photoKeys]
          );
          if (!facilityCardR.rows[0]) {
            await client.query("ROLLBACK");
            return { error: "insert_failed" as const };
          }
          facilityCardId = facilityCardR.rows[0].id;
        }

        for (const rid of allReportIds) {
          await client.query(
            `UPDATE reports SET facility_card_id = $1, updated_at = NOW() WHERE id = $2`,
            [facilityCardId, rid]
          );
        }

        await client.query("COMMIT");
        return { facility_card_id: facilityCardId, action: existingCardR.rows[0] ? "merged" as const : "created" as const };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result && "error" in result) {
      if (result.error === "not_found") {
        return c.json({ error: { code: "NOT_FOUND", message: result.message } }, 404);
      }
    }

    return c.json(result);
  }),
);
