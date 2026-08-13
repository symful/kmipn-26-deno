import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const CreateSlaRuleSchema = z.object({
  kategori_id: z.string().uuid("Invalid kategori_id format"),
  prioritas: z.enum(["rendah", "sedang", "tinggi", "kritis"], {
    errorMap: () => ({ message: "prioritas must be one of: rendah, sedang, tinggi, kritis" }),
  }),
  jam: z.number().int().positive("jam must be a positive integer"),
  is_active: z.boolean().default(true),
});

export const adminDaerahSlaRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /api/admin-daerah/sla — list all SLA rules (paginated, filterable)
adminDaerahSlaRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const kategoriId = c.req.query("kategori_id");
    const prioritas = c.req.query("prioritas");
    const isActive = c.req.query("is_active");

    const result = await withClient(c.env, async (client: PgClient) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (kategoriId) {
        conditions.push(`sr.kategori_id = $${paramIdx++}`);
        params.push(kategoriId);
      }
      if (prioritas) {
        conditions.push(`sr.prioritas = $${paramIdx++}`);
        params.push(prioritas);
      }
      if (isActive !== undefined) {
        conditions.push(`sr.is_active = $${paramIdx++}`);
        params.push(isActive === "true");
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM sla_rules sr ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const query = `
        SELECT sr.id, sr.kategori_id, sr.prioritas, sr.jam, sr.is_active,
               sr.created_by, sr.created_at, sr.updated_at,
               c.nama as kategori_nama
        FROM sla_rules sr
        LEFT JOIN categories c ON c.id = sr.kategori_id
        ${whereClause}
        ORDER BY sr.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;
      params.push(limit, offset);

      const r = await client.query(query, params);
      return { rows: r.rows, total };
    });

    const rules = result.rows.map((row) => ({
      id: row.id,
      kategori_id: row.kategori_id,
      kategori_nama: row.kategori_nama,
      prioritas: row.prioritas,
      jam: row.jam,
      is_active: row.is_active,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return c.json({
      data: rules,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit),
      },
    });
  }),
);

// POST /api/admin-daerah/sla — create new SLA rule
adminDaerahSlaRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const body = await c.req.json();
    const parsed = CreateSlaRuleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const { kategori_id, prioritas, jam, is_active } = parsed.data;

    const result = await withClient(c.env, async (client: PgClient) => {
      await client.query("BEGIN");
      try {
        // Check if active rule with same kategori_id + prioritas already exists
        const existing = await client.query(
          `SELECT id FROM sla_rules
           WHERE kategori_id = $1 AND prioritas = $2 AND is_active = true`,
          [kategori_id, prioritas]
        );

        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return { conflict: true };
        }

        const r = await client.query(
          `INSERT INTO sla_rules (kategori_id, prioritas, jam, is_active, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, kategori_id, prioritas, jam, is_active, created_by, created_at, updated_at`,
          [kategori_id, prioritas, jam, is_active, admin.sub]
        );

        await client.query("COMMIT");
        return { row: r.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result.conflict) {
      return c.json({
        error: {
          code: "CONFLICT",
          message: `Active SLA rule for kategori_id=${kategori_id} and prioritas=${prioritas} already exists`,
        },
      }, 409);
    }

    return c.json({
      id: result.row.id,
      kategori_id: result.row.kategori_id,
      prioritas: result.row.prioritas,
      jam: result.row.jam,
      is_active: result.row.is_active,
      created_by: result.row.created_by,
      created_at: result.row.created_at,
      updated_at: result.row.updated_at,
    }, 201);
  }),
);
