import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const UpdateSlaRuleSchema = z.object({
  kategori_id: z.string().uuid("Invalid kategori_id format").optional(),
  prioritas: z.enum(["rendah", "sedang", "tinggi", "kritis"], {
    errorMap: () => ({ message: "prioritas must be one of: rendah, sedang, tinggi, kritis" }),
  }).optional(),
  jam: z.number().int().positive("jam must be a positive integer").optional(),
  is_active: z.boolean().optional(),
});

export const adminDaerahSlaDetailRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /api/admin-daerah/sla/:id — get single SLA rule
adminDaerahSlaDetailRoute.get(
  "/:id",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT sr.id, sr.kategori_id, sr.prioritas, sr.jam, sr.is_active,
                sr.created_by, sr.created_at, sr.updated_at,
                c.nama as kategori_nama
         FROM sla_rules sr
         LEFT JOIN categories c ON c.id = sr.kategori_id
         WHERE sr.id = $1`,
        [id]
      );
      return r.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "SLA rule not found" } }, 404);
    }

    return c.json({
      id: result.id,
      kategori_id: result.kategori_id,
      kategori_nama: result.kategori_nama,
      prioritas: result.prioritas,
      jam: result.jam,
      is_active: result.is_active,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    });
  }),
);

// PUT /api/admin-daerah/sla/:id — update SLA rule
adminDaerahSlaDetailRoute.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = UpdateSlaRuleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const { kategori_id, prioritas, jam, is_active } = parsed.data;

    if (kategori_id !== undefined) {
      fields.push(`kategori_id = $${paramIdx++}`);
      params.push(kategori_id);
    }
    if (prioritas !== undefined) {
      fields.push(`prioritas = $${paramIdx++}`);
      params.push(prioritas);
    }
    if (jam !== undefined) {
      fields.push(`jam = $${paramIdx++}`);
      params.push(jam);
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
      await client.query("BEGIN");
      try {
        const beforeResult = await client.query(
          `SELECT kategori_id, prioritas FROM sla_rules WHERE id = $1`,
          [id]
        );
        if (!beforeResult.rows[0]) {
          await client.query("ROLLBACK");
          return { notFound: true };
        }

        const before = beforeResult.rows[0];
        const newKategoriId = kategori_id ?? before.kategori_id;
        const newPrioritas = prioritas ?? before.prioritas;

        const existing = await client.query(
          `SELECT id FROM sla_rules
           WHERE kategori_id = $1 AND prioritas = $2 AND is_active = true AND id != $3`,
          [newKategoriId, newPrioritas, id]
        );

        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return { conflict: true };
        }

        const r = await client.query(
          `UPDATE sla_rules SET ${fields.join(", ")} WHERE id = $${paramIdx}
           RETURNING id, kategori_id, prioritas, jam, is_active, created_by, created_at, updated_at`,
          params
        );

        await client.query("COMMIT");
        return { after: r.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "SLA rule not found" } }, 404);
    }

    if (result.conflict) {
      return c.json({
        error: {
          code: "CONFLICT",
          message: `Active SLA rule for kategori_id=${kategori_id ?? "current"} and prioritas=${prioritas ?? "current"} already exists`,
        },
      }, 409);
    }

    return c.json({
      id: result.after.id,
      kategori_id: result.after.kategori_id,
      prioritas: result.after.prioritas,
      jam: result.after.jam,
      is_active: result.after.is_active,
      created_by: result.after.created_by,
      created_at: result.after.created_at,
      updated_at: result.after.updated_at,
    });
  }),
);

// DELETE /api/admin-daerah/sla/:id — soft-delete (set is_active = false)
adminDaerahSlaDetailRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const result = await withClient(c.env, async (client: PgClient) => {
      const existing = await client.query(
        `SELECT id, is_active FROM sla_rules WHERE id = $1`,
        [id]
      );

      if (!existing.rows[0]) {
        return { notFound: true };
      }

      if (!existing.rows[0].is_active) {
        return { alreadyInactive: true };
      }

      await client.query(
        `UPDATE sla_rules SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      return { success: true };
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "SLA rule not found" } }, 404);
    }

    if (result.alreadyInactive) {
      return c.json({ error: { code: "BAD_REQUEST", message: "SLA rule is already inactive" } }, 400);
    }

    return c.json({ message: "SLA rule soft-deleted successfully" });
  }),
);
