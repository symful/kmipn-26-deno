import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";
import { z } from "zod";

export const adminDaerahCasesRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const ListCasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  category_id: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

adminDaerahCasesRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const query = ListCasesQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, status, category_id, search, severity } = query.data;
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (status) { filters.push(`r.status = $${i++}`); params.push(status); }
    if (category_id) { filters.push(`r.category_id = $${i++}`); params.push(category_id); }
    if (search) { params.push(`%${search}%`); filters.push(`(r.title ILIKE $${i++} OR r.description ILIKE $${i++})`); }
    if (severity) { filters.push(`r.severity = $${i++}`); params.push(severity); }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const baseSelect = `SELECT r.id, r.category_id, r.description, r.title,
               ST_X(r.geom::geometry) AS lng, ST_Y(r.geom::geometry) AS lat,
               r.status, r.severity, r.photo_urls, r.created_at, r.updated_at,
               r.assigned_to, c.name AS category_name, c.icon AS category_icon
        FROM reports r
        LEFT JOIN categories c ON c.id = r.category_id`;
    const baseCount = `SELECT COUNT(*)::int AS total FROM reports r ${whereClause}`;

    const { sql: listSql, params: listParams } = applyWilayahFilter(
      `${baseSelect} ${whereClause} ORDER BY r.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset],
      user.wilayah_id,
      "r",
    );
    const { sql: countSql, params: countParams } = applyWilayahFilter(
      baseCount,
      params,
      user.wilayah_id,
      "r",
    );

    const [listResult, countResult] = await withClient(c.env, async (client: PgClient) => {
      const [listR, countR] = await Promise.all([
        client.query(listSql, listParams),
        client.query(countSql, countParams),
      ]);
      return [listR, countR];
    });

    const total = countResult.rows[0]?.total ?? 0;
    return c.json({
      data: listResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
