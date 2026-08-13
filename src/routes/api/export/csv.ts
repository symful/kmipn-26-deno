import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { redactPII } from "@/lib/csv-redaction";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const exportCsvRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Escape CSV cell values to prevent injection (formula =, +, -, @, etc.)
function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  // Prefix dangerous chars with single quote
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

exportCsvRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const rows = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (status) { filters.push(`r.status = $${i++}`); params.push(status); }
      if (categoryId) { filters.push(`r.category_id = $${i++}`); params.push(categoryId); }
      if (user.role !== "ADMIN" && user.wilayah_id) {
        filters.push(`r.wilayah_id = $${i++}`);
        params.push(user.wilayah_id);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const r = await client.query(
        `SELECT r.id, r.created_at, r.status, r.severity, c.name AS category_name,
                r.description, ST_Y(r.geom::geometry) AS lat, ST_X(r.geom::geometry) AS lng,
                COALESCE(array_length(r.photo_urls, 1), 0) AS photo_count
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT 5000`,
        params
      );
      return r.rows;
    });

    const headers = [
      "id", "created_at", "status", "severity", "category_name",
      "description", "lat", "lng", "photo_count",
    ];
    const lines: string[] = [headers.map(csvEscape).join(",")];
    for (const row of rows) {
      const desc = String(row.description ?? "");
      const redactedDesc = redactPII(desc).slice(0, 500);
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      const roundedLat = Number.isFinite(lat) ? lat.toFixed(4) : "";
      const roundedLng = Number.isFinite(lng) ? lng.toFixed(4) : "";
      lines.push([
        csvEscape(row.id),
        csvEscape(row.created_at),
        csvEscape(row.status),
        csvEscape(row.severity),
        csvEscape(row.category_name),
        csvEscape(redactedDesc),
        csvEscape(roundedLat),
        csvEscape(roundedLng),
        csvEscape(row.photo_count),
      ].join(","));
    }
    const body = lines.join("\n") + "\n";

    const action = "export_csv";
    appendAudit(c.env, {
      actor: c.get("user").sub,
      action,
      objectType: "report_export",
      objectId: `export_${Date.now()}`,
    }).catch((e) => logger.error({ route: "/api/export/csv", method: "GET", context: "audit_write_failed", action, error: e as Error }));

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reports-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }),
);
