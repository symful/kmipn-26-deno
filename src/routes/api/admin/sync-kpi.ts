import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { z } from "zod";

const ListSyncKpiQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  device_id: z.string().max(255).optional(),
  platform: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
});

export const adminSyncKpiRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminSyncKpiRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const query = ListSyncKpiQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() },
        400,
      );
    }

    const { page, limit, device_id, platform, status } = query.data;
    const offset = (page - 1) * limit;

    const params: (string | number)[] = [];
    let whereClause = "WHERE 1=1";

    if (device_id) {
      params.push(`%${device_id}%`);
      whereClause += ` AND device_id ILIKE $${params.length}`;
    }
    if (platform) {
      params.push(platform);
      whereClause += ` AND platform = $${params.length}`;
    }
    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const countResult = await withClient(c.env, async (client: PgClient) => {
      return client.query(`SELECT COUNT(*) FROM sync_kpi ${whereClause}`, params);
    });
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const listResult = await withClient(c.env, async (client: PgClient) => {
      const listQuery = `
        SELECT id, device_id, platform, status, reports_count, last_sync_at, last_reported_at, created_at, updated_at
        FROM sync_kpi
        ${whereClause}
        ORDER BY last_reported_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;
      return client.query(listQuery, params);
    });

    const kpis = listResult.rows.map((row) => ({
      id: row.id,
      device_id: row.device_id,
      platform: row.platform,
      status: row.status,
      reports_count: row.reports_count,
      last_sync_at: row.last_sync_at,
      last_reported_at: row.last_reported_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return c.json({
      data: kpis,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
