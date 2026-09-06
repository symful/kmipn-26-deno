import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { UpdateSlaRuleSchema } from "@/lib/schemas";

export const regionalSlaDetailRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

regionalSlaDetailRoute.get(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const result = await c.env.D1.prepare(
      `SELECT sr.id, sr.kategori_id, sr.prioritas, sr.jam, sr.is_active,
              sr.created_by, sr.created_at, sr.updated_at,
              c.name as kategori_nama
       FROM sla_rules sr
       LEFT JOIN categories c ON c.id = sr.kategori_id
       WHERE sr.id = ?1`,
    )
      .bind(id)
      .first<{
        id: string;
        kategori_id: string | null;
        kategori_nama: string | null;
        prioritas: string;
        jam: number;
        is_active: number;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>();

    if (!result) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "SLA rule not found" } },
        404,
      );
    }

    return c.json({
      id: result.id,
      kategori_id: result.kategori_id,
      kategori_nama: result.kategori_nama,
      prioritas: result.prioritas,
      jam: result.jam,
      is_active: Boolean(result.is_active),
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    });
  }),
);

regionalSlaDetailRoute.put(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const { kategori_id, prioritas, jam, is_active } = await parseJson(
      c,
      UpdateSlaRuleSchema,
    );

    const beforeResult = await c.env.D1.prepare(
      `SELECT kategori_id, prioritas FROM sla_rules WHERE id = ?1`,
    )
      .bind(id)
      .first<{ kategori_id: string | null; prioritas: string }>();

    if (!beforeResult) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "SLA rule not found" } },
        404,
      );
    }

    const newKategoriId = kategori_id ?? beforeResult.kategori_id;
    const newPrioritas = prioritas ?? beforeResult.prioritas;

    const existing = await c.env.D1.prepare(
      `SELECT id FROM sla_rules
       WHERE kategori_id = ?1 AND prioritas = ?2 AND is_active = true AND id != ?3`,
    )
      .bind(newKategoriId, newPrioritas, id)
      .first<{ id: string }>();

    if (existing) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: `Active SLA rule for kategori_id=${kategori_id ?? "current"} and prioritas=${prioritas ?? "current"} already exists`,
          },
        },
        409,
      );
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (kategori_id !== undefined) {
      fields.push(`kategori_id = ?${paramIdx++}`);
      params.push(kategori_id);
    }
    if (prioritas !== undefined) {
      fields.push(`prioritas = ?${paramIdx++}`);
      params.push(prioritas);
    }
    if (jam !== undefined) {
      fields.push(`jam = ?${paramIdx++}`);
      params.push(jam);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = ?${paramIdx++}`);
      params.push(is_active ? 1 : 0);
    }

    if (fields.length === 0) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "No fields to update" },
        },
        400,
      );
    }

    fields.push(`updated_at = datetime('now')`);
    params.push(id);

    await c.env.D1.prepare(
      `UPDATE sla_rules SET ${fields.join(", ")} WHERE id = ?${paramIdx}`,
    )
      .bind(...params)
      .run();

    const afterResult = await c.env.D1.prepare(
      `SELECT id, kategori_id, prioritas, jam, is_active, created_by, created_at, updated_at
       FROM sla_rules WHERE id = ?1`,
    )
      .bind(id)
      .first<{
        id: string;
        kategori_id: string | null;
        prioritas: string;
        jam: number;
        is_active: number;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>();

    return c.json({
      id: afterResult!.id,
      kategori_id: afterResult!.kategori_id,
      prioritas: afterResult!.prioritas,
      jam: afterResult!.jam,
      is_active: Boolean(afterResult!.is_active),
      created_by: afterResult!.created_by,
      created_at: afterResult!.created_at,
      updated_at: afterResult!.updated_at,
    });
  }),
);

regionalSlaDetailRoute.delete(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const existing = await c.env.D1.prepare(
      `SELECT id, is_active FROM sla_rules WHERE id = ?1`,
    )
      .bind(id)
      .first<{ id: string; is_active: number }>();

    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "SLA rule not found" } },
        404,
      );
    }

    if (!existing.is_active) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "SLA rule is already inactive",
          },
        },
        400,
      );
    }

    await c.env.D1.prepare(
      `UPDATE sla_rules SET is_active = false, updated_at = datetime('now') WHERE id = ?1`,
    )
      .bind(id)
      .run();

    return c.json({ message: "SLA rule soft-deleted successfully" });
  }),
);
