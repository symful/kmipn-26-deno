import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { AdminDaerahPetugasQuerySchema } from "@/lib/schemas";

export const regionalPetugasRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

regionalPetugasRoute.get(
  "/",
  safeHandler(async (c) => {
    const { page, limit, search, is_active } = parseQuery(
      c,
      AdminDaerahPetugasQuerySchema,
    );
    const offset = (page - 1) * limit;

    const filters: string[] = ["role = 'PETUGAS'", "deleted_at IS NULL"];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      filters.push(`(LOWER(name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))`);
    }
    if (is_active !== undefined) {
      filters.push(`disabled = ?`);
      params.push(!is_active);
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const baseCount = `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM users ${whereClause}`;
    const baseSelect = `SELECT id, email, name, role, disabled, created_at, updated_at FROM users ${whereClause} ORDER BY created_at DESC`;
    const listSql = `${baseSelect} LIMIT ? OFFSET ?`;

    const [countResult, listResult] = await Promise.all([
      c.env.D1.prepare(baseCount)
        .bind(...params)
        .first(),
      c.env.D1.prepare(listSql)
        .bind(...params, limit, offset)
        .all(),
    ]);

    const total = Number(countResult?.total ?? 0);
    return c.json({
      items: listResult.results ?? [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
