import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const auditorSystemLogsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auditorSystemLogsRoute.get(
  "/",
  requireAuth,
  requireRole("AUDITOR", "ADMIN"),
  safeHandler(async (c) => {
    const level = c.req.query("level");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50));
    const offset = (page - 1) * limit;

    const entries = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (level) { filters.push(`level = $${i++}`); params.push(level); }
      if (from) { filters.push(`created_at >= $${i++}`); params.push(from); }
      if (to) { filters.push(`created_at <= $${i++}`); params.push(to); }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const totalR = await client.query(
        `SELECT COUNT(*)::int AS total FROM system_logs ${where}`,
        params
      );
      const total = totalR.rows[0]?.total ?? 0;

      const listParams = [...params, limit, offset];
      const logsR = await client.query(
        `SELECT id, level, message, context, created_at
         FROM system_logs ${where}
         ORDER BY created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        listParams
      );

      return {
        entries: logsR.rows.map((row) => ({
          id: row.id,
          level: row.level,
          message: row.message,
          context: row.context,
          created_at: row.created_at,
        })),
        total,
      };
    });

    return c.json({ entries: entries.entries, total: entries.total, page, limit });
  }),
);
