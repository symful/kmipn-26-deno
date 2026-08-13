import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";
import { applyWilayahFilter } from "@/lib/rbac";

export const verifikatorQueueRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const NON_TERMINAL_STATUSES = ["submitted", "under_review", "verified", "assigned", "in_progress", "needs_survey"] as const;

verifikatorQueueRoute.get("/", requireAuth, requireRole("VERIFIKATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");

  // Parse query params
  const statusParam = c.req.query("status");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
  const kategori = c.req.query("kategori");
  const offset = (page - 1) * limit;

  const statuses: string[] = statusParam
    ? statusParam.split(",").map((s) => s.trim())
    : [...NON_TERMINAL_STATUSES];

  const items = await withClient(c.env, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [...statuses];

    const placeholders = statuses.map((_, i) => `$${i + 1}`).join(", ");
    conditions.push(`r.status IN (${placeholders})`);

    if (kategori) {
      params.push(kategori);
      conditions.push(`r.category_id = $${params.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const countSql = `SELECT COUNT(*) as total FROM reports r WHERE ${whereClause}`;
    const { sql: countQuery, params: countParams } = applyWilayahFilter(countSql, params, user.wilayah_id, "r");
    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limit, offset);
    const mainSql = `SELECT r.id, r.category_id, r.description,
              ST_X(r.geom::geometry) AS lng, ST_Y(r.geom::geometry) AS lat,
              r.status, r.severity, r.photo_urls, r.created_at,
              COALESCE(ps.override_score, ps.computed_score) AS priority_score
       FROM reports r
       LEFT JOIN priority_scores ps ON ps.report_id = r.id
       WHERE ${whereClause}
       ORDER BY priority_score DESC NULLS LAST, r.created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { sql: finalSql, params: finalParams } = applyWilayahFilter(mainSql, params, user.wilayah_id, "r");

    const r = await client.query(finalSql, finalParams);
    return { rows: r.rows, total };
  });

  const totalPages = Math.ceil(items.total / limit);
  return c.json({
    items: items.rows,
    total: items.total,
    page,
    limit,
    total_pages: totalPages,
  });
}));
