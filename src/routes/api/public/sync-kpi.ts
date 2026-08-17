import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { z } from "zod";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

const SyncKpiSchema = z.object({
  device_id: z.string().min(1).max(255),
  platform: z.string().min(1).max(50),
  reports_count: z.number().int().min(0).default(0),
  last_sync_at: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid ISO 8601 datetime",
  }).optional(),
});

export const publicSyncKpiRoute = new Hono<{ Bindings: Env }>();

publicSyncKpiRoute.post(
  "/",
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = SyncKpiSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const { device_id, platform, reports_count, last_sync_at } = parsed.data;

    if (!checkRateLimit(`sync-kpi:${device_id}`, 60, 3600000)) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }

    const result = await withClient(c.env, async (client) => {
      const upserted = await client.query<{
        id: string;
        device_id: string;
        platform: string;
        status: string;
        reports_count: number;
        last_sync_at: string;
        last_reported_at: string;
      }>(
        `INSERT INTO sync_kpi (device_id, platform, reports_count, last_sync_at, last_reported_at, status, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), 'active', NOW())
         ON CONFLICT (device_id, platform) DO UPDATE SET
           reports_count = EXCLUDED.reports_count,
           last_sync_at = COALESCE(EXCLUDED.last_sync_at, sync_kpi.last_sync_at),
           last_reported_at = NOW(),
           updated_at = NOW()
         RETURNING id, device_id, platform, status, reports_count, last_sync_at, last_reported_at`,
        [device_id, platform, reports_count, last_sync_at ? new Date(last_sync_at) : null],
      );
      return upserted.rows[0];
    });

    if (!result) {
      return c.json(
        { error: { code: "DB_ERROR", message: "Failed to sync KPI" } },
        500,
      );
    }

    return c.json({
      id: result.id,
      platform: result.platform,
      status: result.status,
      reports_count: result.reports_count,
      last_sync_at: result.last_sync_at,
      last_reported_at: result.last_reported_at,
    });
  }),
);

publicSyncKpiRoute.get(
  "/",
  safeHandler(async (c) => {
    const stats = await withClient(c.env, async (client) => {
      const totalDevicesResult = await client.query(
        `SELECT COUNT(DISTINCT device_id)::int AS total_devices
         FROM sync_kpi WHERE device_id IS NOT NULL`
      );
      const totalDevices = totalDevicesResult.rows[0]?.total_devices ?? 0;

      const totalReportsResult = await client.query(
        `SELECT COUNT(*)::int AS total_reports FROM reports`
      );
      const totalReports = totalReportsResult.rows[0]?.total_reports ?? 0;

      const byStatusResult = await client.query(
        `SELECT status, COUNT(*)::int AS count
         FROM reports
         GROUP BY status`
      );
      const by_status: Record<string, number> = {};
      for (const row of byStatusResult.rows) {
        by_status[row.status] = row.count;
      }

      const byCategoryResult = await client.query(
        `SELECT c.id, c.name, c.slug, COUNT(r.id)::int AS count
         FROM categories c
         LEFT JOIN reports r ON r.category_id = c.id
         GROUP BY c.id, c.name, c.slug
         ORDER BY count DESC
         LIMIT 20`
      );

      const recentActivityResult = await client.query(
        `SELECT COUNT(*)::int AS recent_reports
         FROM reports
         WHERE created_at > NOW() - INTERVAL '7 days'`
      );
      const recent_reports_7d = recentActivityResult.rows[0]?.recent_reports ?? 0;

      const resolvedRecentlyResult = await client.query(
        `SELECT COUNT(*)::int AS resolved_recently
         FROM reports
         WHERE status IN ('resolved', 'closed')
           AND updated_at > NOW() - INTERVAL '7 days'`
      );
      const resolved_recently_7d = resolvedRecentlyResult.rows[0]?.resolved_recently ?? 0;

      return {
        total_devices: totalDevices,
        total_reports: totalReports,
        by_status,
        by_category: byCategoryResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          count: row.count,
        })),
        recent_reports_7d,
        resolved_recently_7d,
        resolution_rate_7d: recent_reports_7d > 0
          ? Math.round((resolved_recently_7d / recent_reports_7d) * 100)
          : 0,
      };
    });

    return c.json(stats);
  }),
);
