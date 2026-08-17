import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, hashPassword, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const UnitType = z.enum(["SURVEYOR", "PETUGAS"]);
type UnitType = z.infer<typeof UnitType>;

const UnitCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["surveyor_team", "field_unit"]),
  email: z.string().email().max(255).optional(),
  password: z.string().min(8).max(128).optional(),
});

const UnitUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["surveyor_team", "field_unit"]).optional(),
  members: z.array(z.string().uuid()).optional(),
});

const ListUnitsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
});

export const unitsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /api/admin/units - List all units (paginated)
unitsRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const query = ListUnitsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, search } = query.data;
    const offset = (page - 1) * limit;

    const params: (string | number)[] = [];
    let whereClause = "WHERE role IN ('SURVEYOR', 'PETUGAS') AND deleted_at IS NULL";
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND name ILIKE $${params.length}`;
    }

    const countResult = await withClient(c.env, async (client: PgClient) => {
      return client.query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
    });
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const listResult = await withClient(c.env, async (client: PgClient) => {
      const listQuery = `
        SELECT id, name, role, email, created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;
      return client.query(listQuery, params);
    });

    const units = listResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.role === "SURVEYOR" ? "surveyor_team" : "field_unit",
      email: row.email as string | null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return c.json({
      data: units,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);

// POST /api/admin/units - Create a new unit
unitsRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const body = await c.req.json();
    const parsed = UnitCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    const role = parsed.data.type === "surveyor_team" ? "SURVEYOR" : "PETUGAS";
    const email = parsed.data.email ?? `${parsed.data.name.toLowerCase().replace(/\s+/g, ".")}@unit.local`;
    const password = parsed.data.password ?? "password123";

    const password_hash = await hashPassword(password);

    try {
      const inserted = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query(
          `INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING id, email, name, role, created_at, updated_at`,
          [email, password_hash, parsed.data.name, role]
        );
        return r.rows[0];
      });

      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: admin.sub,
        action: "unit_create",
        objectType: "unit",
        objectId: inserted.id,
        after: { name: inserted.name, role: inserted.role },
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "unit_create", err: e }));

      return c.json({
        id: inserted.id,
        name: inserted.name,
        type: inserted.role === "SURVEYOR" ? "surveyor_team" : "field_unit",
        email: inserted.email,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      }, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return c.json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already registered" } }, 409);
      }
      throw e;
    }
  }),
);

// PATCH /api/admin/units/:id - Update unit name or members
unitsRoute.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const unitId = c.req.param("id");

    const body = await c.req.json();
    const parsed = UnitUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
    }

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, name, role FROM users WHERE id = $1 AND role IN ('SURVEYOR', 'PETUGAS') AND deleted_at IS NULL`,
        [unitId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "Unit not found" } }, 404);
    }

    const updates: string[] = [];
    const values: (string | undefined)[] = [];

    if (parsed.data.name !== undefined) {
      values.push(parsed.data.name);
      updates.push(`name = $${values.length}`);
    }
    if (parsed.data.type !== undefined) {
      const role = parsed.data.type === "surveyor_team" ? "SURVEYOR" : "PETUGAS";
      values.push(role);
      updates.push(`role = $${values.length}`);
    }
    // members assignment requires a separate unit_members table - accepted but not processed per "use users table as fallback"

    if (updates.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No valid fields to update" } }, 400);
    }

    values.push(unitId);
    const updated = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length} AND role IN ('SURVEYOR', 'PETUGAS')
         RETURNING id, name, role, email, created_at, updated_at`,
        values
      );
      return r.rows[0];
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: admin.sub,
      action: "unit_update",
      objectType: "unit",
      objectId: unitId,
      before: { name: before.name, role: before.role },
      after: { name: updated.name, role: updated.role },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "unit_update", err: e }));

    return c.json({
      id: updated.id,
      name: updated.name,
      type: updated.role === "SURVEYOR" ? "surveyor_team" : "field_unit",
      email: updated.email,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    });
  }),
);

// DELETE /api/admin/units/:id - Soft delete a unit
unitsRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const unitId = c.req.param("id");

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, name, role FROM users WHERE id = $1 AND role IN ('SURVEYOR', 'PETUGAS') AND deleted_at IS NULL`,
        [unitId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "Unit not found" } }, 404);
    }

    await withClient(c.env, async (client: PgClient) => {
      await client.query(
        `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [unitId]
      );
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: admin.sub,
      action: "unit_delete",
      objectType: "unit",
      objectId: unitId,
      before: { name: before.name, role: before.role },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "unit_delete", err: e }));

    return c.json({ message: "Unit deleted successfully" });
  }),
);
