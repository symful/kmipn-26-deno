import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { z } from "zod";

const CreateUnitSchema = z.object({
  nama: z.string().min(1).max(255),
  wilayah_id: z.string().uuid("Invalid wilayah_id format"),
  alamat: z.string().max(1000).optional(),
  kontak: z.string().max(100).optional(),
  is_active: z.boolean().default(true),
});

export const adminDaerahUnitsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminDaerahUnitsRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const wilayahId = c.req.query("wilayah_id");
    const isActive = c.req.query("is_active");

    const result = await withClient(c.env, async (client: PgClient) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (wilayahId) {
        conditions.push(`u.wilayah_id = $${paramIdx++}`);
        params.push(wilayahId);
      }
      if (isActive !== undefined) {
        conditions.push(`u.is_active = $${paramIdx++}`);
        params.push(isActive === "true");
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM units u ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const query = `
        SELECT u.id, u.nama, u.wilayah_id, u.alamat, u.kontak, u.is_active,
               u.created_by, u.created_at, u.updated_at,
               w.nama as wilayah_nama
        FROM units u
        LEFT JOIN wilayah w ON w.id = u.wilayah_id
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;
      params.push(limit, offset);

      const r = await client.query(query, params);
      return { rows: r.rows, total };
    });

    const units = result.rows.map((row) => ({
      id: row.id,
      nama: row.nama,
      wilayah_id: row.wilayah_id,
      wilayah_nama: row.wilayah_nama,
      alamat: row.alamat,
      kontak: row.kontak,
      is_active: row.is_active,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return c.json({
      data: units,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit),
      },
    });
  }),
);

adminDaerahUnitsRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const body = await c.req.json();
    const parsed = CreateUnitSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const { nama, wilayah_id, alamat, kontak, is_active } = parsed.data;

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `INSERT INTO units (nama, wilayah_id, alamat, kontak, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nama, wilayah_id, alamat, kontak, is_active, created_by, created_at, updated_at`,
        [nama, wilayah_id, alamat ?? null, kontak ?? null, is_active, admin.sub]
      );
      return r.rows[0];
    });

    return c.json({
      id: result.id,
      nama: result.nama,
      wilayah_id: result.wilayah_id,
      alamat: result.alamat,
      kontak: result.kontak,
      is_active: result.is_active,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }, 201);
  }),
);
