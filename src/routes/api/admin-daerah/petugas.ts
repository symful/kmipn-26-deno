import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";
import { z } from "zod";

export const adminDaerahPetugasRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const ListPetugasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  is_active: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

adminDaerahPetugasRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const query = ListPetugasQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, search, is_active } = query.data;
    const offset = (page - 1) * limit;

    const filters: string[] = ["role = 'PETUGAS'", "deleted_at IS NULL"];
    const params: unknown[] = [];
    let i = 1;
    if (search) { params.push(`%${search}%`); filters.push(`(name ILIKE $${i++} OR email ILIKE $${i++})`); }
    if (is_active !== undefined) { filters.push(`disabled = $${i++}`); params.push(!is_active); }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const baseCount = `SELECT COUNT(*)::int AS total FROM users ${whereClause}`;
    const { sql: countSql, params: countParams } = applyWilayahFilter(baseCount, params, user.wilayah_id);

    const listParams = [...params, limit, offset];
    const baseSelect = `SELECT id, email, name, role, disabled, created_at, updated_at FROM users ${whereClause}`;
    const { sql: listSql, params: listParamsFinal } = applyWilayahFilter(
      `${baseSelect} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      listParams,
      user.wilayah_id,
    );

    const [countResult, listResult] = await withClient(c.env, async (client: PgClient) => {
      return [
        await client.query(countSql, countParams),
        await client.query(listSql, listParamsFinal),
      ];
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
