import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { z } from "zod";

const UpdateUnitSchema = z.object({
  nama: z.string().min(1).max(255).optional(),
  wilayah_id: z.string().uuid("Invalid wilayah_id format").optional(),
  alamat: z.string().max(1000).optional(),
  kontak: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});

export const adminDaerahUnitsDetailRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminDaerahUnitsDetailRoute.get(
  "/:id",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT u.id, u.nama, u.wilayah_id, u.alamat, u.kontak, u.is_active,
                u.created_by, u.created_at, u.updated_at,
                w.nama as wilayah_nama
         FROM units u
         LEFT JOIN wilayah w ON w.id = u.wilayah_id
         WHERE u.id = $1`,
        [id]
      );
      return r.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Unit not found" } }, 404);
    }

    return c.json({
      id: result.id,
      nama: result.nama,
      wilayah_id: result.wilayah_id,
      wilayah_nama: result.wilayah_nama,
      alamat: result.alamat,
      kontak: result.kontak,
      is_active: result.is_active,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    });
  }),
);

adminDaerahUnitsDetailRoute.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = UpdateUnitSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const { nama, wilayah_id, alamat, kontak, is_active } = parsed.data;

    if (nama !== undefined) {
      fields.push(`nama = $${paramIdx++}`);
      params.push(nama);
    }
    if (wilayah_id !== undefined) {
      fields.push(`wilayah_id = $${paramIdx++}`);
      params.push(wilayah_id);
    }
    if (alamat !== undefined) {
      fields.push(`alamat = $${paramIdx++}`);
      params.push(alamat);
    }
    if (kontak !== undefined) {
      fields.push(`kontak = $${paramIdx++}`);
      params.push(kontak);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${paramIdx++}`);
      params.push(is_active);
    }

    if (fields.length === 0) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "No fields to update" },
      }, 400);
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await withClient(c.env, async (client: PgClient) => {
      const existing = await client.query(
        `SELECT id FROM units WHERE id = $1`,
        [id]
      );

      if (!existing.rows[0]) {
        return { notFound: true };
      }

      const r = await client.query(
        `UPDATE units SET ${fields.join(", ")} WHERE id = $${paramIdx}
         RETURNING id, nama, wilayah_id, alamat, kontak, is_active, created_by, created_at, updated_at`,
        params
      );

      return { after: r.rows[0] };
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "Unit not found" } }, 404);
    }

    return c.json({
      id: result.after.id,
      nama: result.after.nama,
      wilayah_id: result.after.wilayah_id,
      alamat: result.after.alamat,
      kontak: result.after.kontak,
      is_active: result.after.is_active,
      created_by: result.after.created_by,
      created_at: result.after.created_at,
      updated_at: result.after.updated_at,
    });
  }),
);

adminDaerahUnitsDetailRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const result = await withClient(c.env, async (client: PgClient) => {
      const existing = await client.query(
        `SELECT id, is_active FROM units WHERE id = $1`,
        [id]
      );

      if (!existing.rows[0]) {
        return { notFound: true };
      }

      if (!existing.rows[0].is_active) {
        return { alreadyInactive: true };
      }

      await client.query(
        `UPDATE units SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      return { success: true };
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "Unit not found" } }, 404);
    }

    if (result.alreadyInactive) {
      return c.json({ error: { code: "BAD_REQUEST", message: "Unit is already inactive" } }, 400);
    }

    return c.json({ message: "Unit soft-deleted successfully" });
  }),
);
