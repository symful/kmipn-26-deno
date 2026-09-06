import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson, parseQuery } from "@/lib/validation";
import { AdminDaerahSlaQuerySchema, CreateSlaRuleSchema } from "@/lib/schemas";

export const regionalSlaRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

regionalSlaRoute.get(
  "/",
  safeHandler(async (c) => {
    const {
      page,
      limit,
      kategori_id: kategoriId,
      prioritas,
      is_active: isActive,
    } = parseQuery(c, AdminDaerahSlaQuerySchema);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (kategoriId) {
      conditions.push(`sr.kategori_id = ?${paramIdx++}`);
      params.push(kategoriId);
    }
    if (prioritas) {
      conditions.push(`sr.prioritas = ?${paramIdx++}`);
      params.push(prioritas);
    }
    if (isActive !== undefined) {
      conditions.push(`sr.is_active = ?${paramIdx++}`);
      params.push(isActive ? 1 : 0);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await c.env.D1.prepare(
      `SELECT COUNT(*) as total FROM sla_rules sr ${whereClause}`,
    )
      .bind(...params)
      .first<{ total: number }>();

    const total = countResult?.total ?? 0;

    const queryParams = [...params];
    queryParams.push(limit, offset);

    const rows = await c.env.D1.prepare(
      `SELECT sr.id, sr.kategori_id, sr.prioritas, sr.jam, sr.is_active,
              sr.created_by, sr.created_at, sr.updated_at,
              c.name as kategori_nama
       FROM sla_rules sr
       LEFT JOIN categories c ON c.id = sr.kategori_id
       ${whereClause}
       ORDER BY sr.created_at DESC
       LIMIT ?${paramIdx++} OFFSET ?${paramIdx++}`,
    )
      .bind(...queryParams)
      .all<{
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

    const rules = (rows.results ?? []).map((row) => ({
      id: row.id,
      kategori_id: row.kategori_id,
      kategori_nama: row.kategori_nama,
      prioritas: row.prioritas,
      jam: row.jam,
      is_active: Boolean(row.is_active),
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return c.json({
      items: rules,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);

regionalSlaRoute.post(
  "/",
  safeHandler(async (c) => {
    const admin = c.get("user");
    const { kategori_id, prioritas, jam, is_active } = await parseJson(
      c,
      CreateSlaRuleSchema,
    );

    const existing = await c.env.D1.prepare(
      `SELECT id FROM sla_rules
       WHERE kategori_id = ?1 AND prioritas = ?2 AND is_active = true`,
    )
      .bind(kategori_id, prioritas)
      .first<{ id: string }>();

    if (existing) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: `Active SLA rule for kategori_id=${kategori_id} and prioritas=${prioritas} already exists`,
          },
        },
        409,
      );
    }

    const ruleId = crypto.randomUUID();
    await c.env.D1.prepare(
      `INSERT INTO sla_rules (id, kategori_id, prioritas, jam, is_active, created_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(ruleId, kategori_id, prioritas, jam, is_active ? 1 : 0, admin.sub)
      .run();

    const newRule = await c.env.D1.prepare(
      `SELECT id, kategori_id, prioritas, jam, is_active, created_by, created_at, updated_at
       FROM sla_rules WHERE id = ?1`,
    )
      .bind(ruleId)
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

    return c.json(
      {
        id: newRule!.id,
        kategori_id: newRule!.kategori_id,
        prioritas: newRule!.prioritas,
        jam: newRule!.jam,
        is_active: Boolean(newRule!.is_active),
        created_by: newRule!.created_by,
        created_at: newRule!.created_at,
        updated_at: newRule!.updated_at,
      },
      201,
    );
  }),
);
