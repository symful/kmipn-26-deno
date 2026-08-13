import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const operatorIndexRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const NON_TERMINAL_STATUSES = ["submitted", "under_review", "verified", "assigned", "in_progress", "needs_survey"] as const;

operatorIndexRoute.get("/", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;
  const statusParam = c.req.query("status");
  const wilayahParam = c.req.query("wilayah_id");
  const categoryParam = c.req.query("category_id");
  const searchParam = c.req.query("search");

  const statuses: string[] = statusParam
    ? statusParam.split(",").map((s) => s.trim())
    : [...NON_TERMINAL_STATUSES];

  const result = await withClient(c.env, async (client) => {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (statuses.length > 0) {
      const placeholders = statuses.map(() => `$${paramIdx++}`).join(", ");
      conditions.push(`r.status IN (${placeholders})`);
      params.push(...statuses);
    }

    if (wilayahParam) {
      conditions.push(`r.wilayah_id = $${paramIdx++}`);
      params.push(wilayahParam);
    }

    if (categoryParam) {
      conditions.push(`r.category_id = $${paramIdx++}`);
      params.push(categoryParam);
    }

    if (searchParam) {
      conditions.push(`(r.description ILIKE $${paramIdx} OR r.id::text ILIKE $${paramIdx})`);
      params.push(`%${searchParam}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countR = await client.query(
      `SELECT COUNT(*)::int AS total FROM reports r ${whereClause}`,
      params
    );
    const total = countR.rows[0]?.total ?? 0;

    const dataParamBase = paramIdx;
    const dataParams = [...params];
    const rowsR = await client.query(
      `SELECT r.id, r.category_id, r.description,
              ST_X(r.geom::geometry) AS lng, ST_Y(r.geom::geometry) AS lat,
              r.status, r.severity, r.photo_urls, r.created_at, r.updated_at,
              r.wilayah_id, r.assigned_to, r.deadline,
              COALESCE(ps.override_score, ps.computed_score) AS priority_score,
              c.name AS category_name, c.slug AS category_slug,
              w.name AS wilayah_name
       FROM reports r
       LEFT JOIN priority_scores ps ON ps.report_id = r.id
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN wilayah w ON w.id = r.wilayah_id
       ${whereClause}
       ORDER BY priority_score DESC NULLS LAST, r.created_at ASC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...dataParams, limit, offset]
    );

    return {
      items: rowsR.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  });

  return c.json(result);
}));
