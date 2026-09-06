import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { AdminDaerahOperatorsQuerySchema } from "@/lib/schemas";

export const regionalOperatorsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

regionalOperatorsRoute.get(
  "/",
  safeHandler(async (c) => {
    const { page, limit, search, is_active } = parseQuery(
      c,
      AdminDaerahOperatorsQuerySchema,
    );
    const offset = (page - 1) * limit;

    const deletedClause = "deleted_at IS NULL";
    const deletedActive = "deleted_at IS NOT NULL";
    const countFilters = ["role = 'ADMIN'", deletedClause];
    const countParams: unknown[] = [];
    if (search) {
      countParams.push(`%${search}%`, `%${search}%`);
      countFilters.push(
        "(LOWER(name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))",
      );
    }
    if (is_active === false) {
      const i = countFilters.indexOf(deletedClause);
      if (i !== -1) countFilters[i] = deletedActive;
      else countFilters.push(deletedActive);
    }
    const countSql = `SELECT COUNT(*) AS total FROM users WHERE ${countFilters.join(" AND ")}`;

    const listFilters = ["role = 'ADMIN'", deletedClause];
    const listParams: unknown[] = [];
    if (search) {
      listParams.push(`%${search}%`, `%${search}%`);
      listFilters.push(
        "(LOWER(name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))",
      );
    }
    if (is_active === false) {
      const i = listFilters.indexOf(deletedClause);
      if (i !== -1) listFilters[i] = deletedActive;
      else listFilters.push(deletedActive);
    }
    const listSql = `SELECT id, email, name, role, created_at, updated_at FROM users WHERE ${listFilters.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const [countResult, listResult] = await Promise.all([
      c.env.D1.prepare(countSql)
        .bind(...countParams)
        .first<{ total: number }>(),
      c.env.D1.prepare(listSql)
        .bind(...listParams, limit, offset)
        .all(),
    ]);

    const total = countResult?.total ?? 0;
    return c.json({
      items: listResult.results,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
