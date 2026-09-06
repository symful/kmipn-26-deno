import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { AdminDaerahCasesQuerySchema } from "@/lib/schemas";
import { normalizeReportsPhotoUrls } from "@/lib/photo-urls";

export const regionalCasesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

regionalCasesRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;
    const { page, limit, status, category_id, search, severity } = parseQuery(
      c,
      AdminDaerahCasesQuerySchema,
    );
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];
    if (status) {
      filters.push(`r.status = ?`);
      params.push(status);
    }
    if (category_id) {
      filters.push(`r.category_id = ?`);
      params.push(category_id);
    }
    if (search) {
      filters.push(`(r.title LIKE ? OR r.description LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (severity) {
      filters.push(`r.severity = ?`);
      params.push(severity);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const baseSelect = `SELECT r.id, r.category_id, r.description, r.title,
               r.lat, r.lng,
               r.status, r.severity, r.photo_urls, r.created_at, r.updated_at,
               r.assigned_to, c.name AS category_name, c.icon AS category_icon
        FROM reports r
        LEFT JOIN categories c ON c.id = r.category_id`;
    const baseCount = `SELECT COUNT(*) AS total FROM reports r ${whereClause}`;

    const [listResult, countResult] = await Promise.all([
      env.D1.prepare(
        `${baseSelect} ${whereClause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      )
        .bind(...params, limit, offset)
        .all(),
      env.D1.prepare(baseCount)
        .bind(...params)
        .first<{ total: number }>(),
    ]);

    const total = countResult?.total ?? 0;
    return c.json({
      items: normalizeReportsPhotoUrls(
        (listResult.results ?? []) as { photo_urls?: unknown }[],
      ),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);
