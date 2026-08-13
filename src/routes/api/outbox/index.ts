import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";

export const outboxRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

outboxRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const targetSystem = c.req.query("target_system");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50));
    const offset = (page - 1) * limit;

    const result = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (status) { filters.push(`o.status = $${i++}`); params.push(status); }
      if (targetSystem) { filters.push(`o.target_system = $${i++}`); params.push(targetSystem); }

      const outboxBase = `SELECT o.id, o.created_at, o.target_system, o.payload, o.status,
          o.retry_count, o.last_attempt_at, o.error_message, o.related_report_id
       FROM outbox o
       LEFT JOIN reports r ON r.id = o.related_report_id`;

      const { sql: listBaseSql, params: listBaseParams } = applyWilayahFilter(
        outboxBase + (filters.length ? ` WHERE ${filters.join(" AND ")}` : ""),
        params,
        user.wilayah_id,
        "r",
      );

      const listParams = [...listBaseParams, limit, offset];
      const r = await client.query(
        `${listBaseSql} ORDER BY o.created_at DESC LIMIT $${listBaseParams.length + 1} OFFSET $${listBaseParams.length + 2}`,
        listParams
      );

      const { sql: countSql, params: countParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS total FROM outbox o LEFT JOIN reports r ON r.id = o.related_report_id` +
        (filters.length ? ` WHERE ${filters.join(" AND ")}` : ""),
        params,
        user.wilayah_id,
        "r",
      );
      const totalR = await client.query(countSql, countParams);
      const total = totalR.rows[0]?.total ?? 0;

      return { entries: r.rows, total };
    });

    return c.json({ entries: result.entries, total: result.total, page, limit });
  }),
);
