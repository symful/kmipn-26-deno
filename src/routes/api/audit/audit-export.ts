import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { csvEscape } from "@/lib/exporters";
import { exportDate } from "@/lib/export-labels";
import {
  auditActionLabel,
  auditObjectLabel,
  auditRoleLabel,
} from "@/lib/audit-labels";

export const auditExportRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

function structuredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

auditExportRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;
    const actorId = c.req.query("actor_id");
    const action = c.req.query("action");
    const objectType = c.req.query("object_type");
    const objectId = c.req.query("object_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const format = c.req.query("format") ?? "csv";

    const filters: string[] = [];
    const params: unknown[] = [];

    if (actorId) {
      filters.push(`actor = ?`);
      params.push(actorId);
    }
    if (action) {
      filters.push(`action = ?`);
      params.push(action);
    }
    if (objectType) {
      filters.push(`object_type = ?`);
      params.push(objectType);
    }
    if (objectId) {
      filters.push(`object_id = ?`);
      params.push(objectId);
    }
    if (from) {
      filters.push(`created_at >= ?`);
      params.push(from);
    }
    if (to) {
      filters.push(`created_at <= ?`);
      params.push(to);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const r = await env.D1.prepare(
      `SELECT id, actor, actor_role, action, object_type, object_id,
              (SELECT name FROM users WHERE users.id = audit_log.actor) AS actor_name,
              before_data, after_data, reason, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT 10000`,
    )
      .bind(...params)
      .all();

    const entries = (r.results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      actor: row.actor,
      actor_name: row.actor_name,
      actor_role: row.actor_role,
      action: row.action,
      object_type: row.object_type,
      object_id: row.object_id,
      before: structuredValue(row.before_data),
      after: structuredValue(row.after_data),
      reason: row.reason,
      created_at: row.created_at,
    }));

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

    const headers = [
      "ID audit",
      "Pengguna",
      "ID pengguna",
      "Peran",
      "Tindakan",
      "Jenis objek",
      "ID objek",
      "Alasan",
      "Waktu (WIB)",
    ];
    const lines: string[] = [headers.map(csvEscape).join(",")];

    for (const entry of entries) {
      lines.push(
        [
          csvEscape(entry.id),
          csvEscape(entry.actor_name ?? "Tidak tercatat"),
          csvEscape(entry.actor ?? ""),
          csvEscape(auditRoleLabel(entry.actor_role)),
          csvEscape(auditActionLabel(entry.action)),
          csvEscape(auditObjectLabel(entry.object_type)),
          csvEscape(entry.object_id ?? ""),
          csvEscape(entry.reason ?? ""),
          csvEscape(exportDate(entry.created_at)),
        ].join(","),
      );
    }

    const body = lines.join("\r\n") + "\r\n";

    logger.info({
      route: c.req.path,
      method: c.req.method,
      context: "auditor_audit_export",
      format,
      count: entries.length,
    });

    return new Response("\uFEFF" + body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }),
);
