import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { checkRateLimit } from "@/lib/ratelimit";
import { redactText } from "@/lib/agent/redaction";
import { generalizeLocation } from "@/lib/geo";

export const publicGeojsonRoute = new Hono<{ Bindings: Env }>();

publicGeojsonRoute.get(
  "/",
  safeHandler(async (c) => {
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("cf-connecting-ip") ??
      "anonymous";
    if (!checkRateLimit(`public-geojson:${ip}`, 60, 60 * 1000)) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }
    const statusParam = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const bboxParam = c.req.query("bbox");
    const monthParam = c.req.query("month");
    const bbox = bboxParam?.split(",").map(Number);
    if (
      (monthParam && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) ||
      (bbox &&
        (bbox.length !== 4 ||
          !bbox.every(Number.isFinite) ||
          bbox[0]! < -180 ||
          bbox[2]! > 180 ||
          bbox[1]! < -90 ||
          bbox[3]! > 90 ||
          bbox[0]! > bbox[2]! ||
          bbox[1]! > bbox[3]!))
    ) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid month or bounding box",
          },
        },
        400,
      );
    }

    const features = async () => {
      const filters: string[] = [
        "r.status NOT IN ('draft', 'rejected', 'out_of_scope')",
        "r.merged_into IS NULL",
      ];
      const params: unknown[] = [];

      if (statusParam) {
        const statuses = statusParam.split(",").map((s) => s.trim());
        filters.push(`r.status IN (${statuses.map(() => `?`).join(", ")})`);
        params.push(...statuses);
      }

      if (categoryId) {
        filters.push(`r.category_id = ?`);
        params.push(categoryId);
      }
      if (monthParam) {
        filters.push("strftime('%Y-%m', r.created_at) = ?");
        params.push(monthParam);
      }
      if (bbox) {
        // Filter the same public grid that is returned, never precise locations.
        filters.push(
          "CAST(r.lng * 1000 AS INTEGER) / 1000.0 BETWEEN ? AND ? AND CAST(r.lat * 1000 AS INTEGER) / 1000.0 BETWEEN ? AND ?",
        );
        params.push(bbox[0], bbox[2], bbox[1], bbox[3]);
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const r = await c.env.D1.prepare(
        `SELECT r.id, r.category_id, c.name AS category_name, r.title, r.description, r.kelurahan, r.kecamatan, r.status, r.severity, r.created_at, r.lat, r.lng
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT 1000`,
      )
        .bind(...params)
        .all<{
          id: string;
          category_id: string;
          category_name: string | null;
          title: string | null;
          kelurahan: string | null;
          kecamatan: string | null;
          description: string;
          status: string;
          severity: number;
          created_at: string;
          lat: number;
          lng: number;
        }>();

      return (r.results ?? []).flatMap((row) => {
        const location = generalizeLocation(row.lat, row.lng);
        if (!location) return [];
        const description = redactText(String(row.description ?? "")).slice(
          0,
          100,
        );

        return [
          {
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [location.lng, location.lat],
            },
            properties: {
              id: row.id,
              category_id: row.category_id,
              category_name: row.category_name,
              title: redactText(
                String(row.title || row.description || "Laporan masyarakat"),
              ).slice(0, 160),
              address_area: [row.kelurahan, row.kecamatan]
                .filter(Boolean)
                .join(", "),
              description,
              status: row.status,
              created_at: row.created_at,
            },
          },
        ];
      });
    };

    return c.json({
      type: "FeatureCollection" as const,
      features: await features(),
    });
  }),
);
