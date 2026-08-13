import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";

export const auditorAuditExportRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

auditorAuditExportRoute.get(
  "/",
  requireAuth,
  requireRole("AUDITOR", "ADMIN"),
  safeHandler(async (c) => {
    const actorId = c.req.query("actor_id");
    const action = c.req.query("action");
    const objectType = c.req.query("object_type");
    const objectId = c.req.query("object_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const format = c.req.query("format") ?? "csv";

    const entries = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (actorId) { filters.push(`actor = $${i++}`); params.push(actorId); }
      if (action) { filters.push(`action = $${i++}`); params.push(action); }
      if (objectType) { filters.push(`object_type = $${i++}`); params.push(objectType); }
      if (objectId) { filters.push(`object_id = $${i++}`); params.push(objectId); }
      if (from) { filters.push(`created_at >= $${i++}`); params.push(from); }
      if (to) { filters.push(`created_at <= $${i++}`); params.push(to); }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const r = await client.query(
        `SELECT id, actor, actor_role, action, object_type, object_id,
                before_data, after_data, reason, prev_hash, entry_hash, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT 10000`,
        params
      );

      return r.rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        actor_role: row.actor_role,
        action: row.action,
        object_type: row.object_type,
        object_id: row.object_id,
        before: row.before_data,
        after: row.after_data,
        reason: row.reason,
        prev_hash: row.prev_hash,
        entry_hash: row.entry_hash,
        created_at: row.created_at,
      }));
    });

    if (format === "json") {
      const body = JSON.stringify(entries, null, 2);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    const headers = ["id", "actor", "actor_role", "action", "object_type", "object_id", "reason", "prev_hash", "entry_hash", "created_at"];
    const lines: string[] = [headers.map(csvEscape).join(",")];

    for (const entry of entries) {
      lines.push([
        csvEscape(entry.id),
        csvEscape(entry.actor ?? ""),
        csvEscape(entry.actor_role ?? ""),
        csvEscape(entry.action),
        csvEscape(entry.object_type),
        csvEscape(entry.object_id ?? ""),
        csvEscape(entry.reason ?? ""),
        csvEscape(entry.prev_hash ?? ""),
        csvEscape(entry.entry_hash ?? ""),
        csvEscape(entry.created_at),
      ].join(","));
    }

    const body = lines.join("\n") + "\n";

    logger.info({ route: c.req.path, method: c.req.method, context: "auditor_audit_export", format, count: entries.length });

    return new Response("\uFEFF" + body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }),
);
