import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";

export const auditSearchRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auditSearchRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "AUDITOR", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const actorId = c.req.query("actor_id");
    const action = c.req.query("action");
    const reportId = c.req.query("report_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50));
    const offset = (page - 1) * limit;

    const result = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (actorId) { filters.push(`actor = $${i++}`); params.push(actorId); }
      if (action) { filters.push(`action = $${i++}`); params.push(action); }
      if (reportId) { filters.push(`object_id = $${i++}`); params.push(reportId); }
      if (from) { filters.push(`created_at >= $${i++}`); params.push(from); }
      if (to) { filters.push(`created_at <= $${i++}`); params.push(to); }

      // Apply wilayah scoping for ADMIN_DAERAH
      const { sql: scopedSql, params: scopedParams } = applyWilayahFilter(
        "",
        params,
        user.role === "ADMIN_DAERAH" ? user.wilayah_id : null,
      );
      if (scopedSql) {
        if (filters.length) {
          filters.push(scopedSql.replace(/^AND /, ""));
        } else {
          filters.push(scopedSql.replace(/^WHERE /, ""));
        }
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const totalR = await client.query(
        `SELECT COUNT(*)::int AS total FROM audit_log ${where}`,
        params
      );
      const total = totalR.rows[0]?.total ?? 0;

      const listParams = [...params, limit, offset];
      const entriesR = await client.query(
        `SELECT id, actor, action, object_type, object_id, before_data, after_data, reason, prev_hash, entry_hash, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        listParams
      );
      return {
        entries: entriesR.rows.map((row) => ({
          id: row.id,
          actor: row.actor,
          action: row.action,
          object_type: row.object_type,
          object_id: row.object_id,
          before: row.before_data,
          after: row.after_data,
          reason: row.reason,
          prev_hash: row.prev_hash,
          entry_hash: row.entry_hash,
          created_at: row.created_at,
        })),
        total,
      };
    });

    return c.json({ entries: result.entries, total: result.total, page, limit });
  }),
);
