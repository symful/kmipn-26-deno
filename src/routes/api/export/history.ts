import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const exportHistoryRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

exportHistoryRoute.get(
  "/",
  safeHandler(async (c) => {
    const recentExportsR = await c.env.D1.prepare(
      `SELECT action, actor, object_type, created_at
       FROM audit_log
       WHERE action LIKE 'export_%'
       ORDER BY created_at DESC
       LIMIT 20`,
    ).all<{
      action: string;
      actor: string;
      object_type: string;
      created_at: string;
    }>();

    const recent_exports = (recentExportsR.results ?? []).map((row) => {
      const format = row.action.includes("csv")
        ? "csv"
        : row.action.includes("geojson")
          ? "geojson"
          : row.action.includes("pdf")
            ? "pdf"
            : "json";
      return {
        format,
        exported_at: row.created_at,
        actor: row.actor,
      };
    });

    return c.json({
      recent_exports,
      connectors: [
        {
          name: "csv_export",
          status: "simulated",
          last_sync: recent_exports[0]?.exported_at ?? null,
        },
        { name: "geojson_export", status: "simulated", last_sync: null },
        { name: "pdf_export", status: "simulated", last_sync: null },
      ],
    });
  }),
);
