import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { requireAuth, hashPassword, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { applyWilayahFilter } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { z } from "zod";

const UserRole = z.enum(["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "RT_RW", "PETUGAS", "ADMIN_DAERAH", "AUDITOR", "PENGAMBIL_KEPUTUSAN"]);
type UserRole = z.infer<typeof UserRole>;

const AdminUserCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  role: UserRole,
  wilayah_id: z.string().uuid().nullable().optional(),
});

const AdminUserUpdateSchema = z.object({
  role: UserRole.optional(),
  password: z.string().min(8).max(128).optional(),
  disabled: z.boolean().optional(),
});

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: UserRole.optional(),
  search: z.string().max(255).optional(),
  wilayah_id: z.string().uuid().optional(),
  is_active: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

export const adminUsersRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminUsersRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const query = ListUsersQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, role, search, wilayah_id, is_active } = query.data;
    const offset = (page - 1) * limit;

    const params: (string | number | boolean)[] = [];
    let whereClause = "WHERE 1=1";
    if (role) {
      params.push(role);
      whereClause += ` AND role = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (email ILIKE $${params.length} OR name ILIKE $${params.length})`;
    }
    if (wilayah_id) {
      params.push(wilayah_id);
      whereClause += ` AND wilayah_id = $${params.length}`;
    }
    if (is_active !== undefined) {
      params.push(!is_active);
      whereClause += ` AND disabled = $${params.length}`;
    }

    const countWilayahResult = applyWilayahFilter(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params,
      admin.wilayah_id
    );

    const countResult = await withClient(c.env, async (client: PgClient) => {
      return client.query(countWilayahResult.sql, countWilayahResult.params);
    });
    const total = parseInt(countResult.rows[0].count, 10);

    const listWilayahResult = applyWilayahFilter(
      `SELECT id, email, name, role, wilayah_id, disabled, created_at, updated_at FROM users ${whereClause} ORDER BY created_at DESC`,
      params,
      admin.wilayah_id
    );

    listWilayahResult.params.push(limit, offset);
    listWilayahResult.sql += ` LIMIT $${listWilayahResult.params.length - 1} OFFSET $${listWilayahResult.params.length}`;

    const listResult = await withClient(c.env, async (client: PgClient) => {
      return client.query(listWilayahResult.sql, listWilayahResult.params);
    });

    return c.json({
      data: listResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);

adminUsersRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const body = await c.req.json();
    const parsed = AdminUserCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    const password_hash = await hashPassword(parsed.data.password);

    try {
      const inserted = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query(
          `INSERT INTO users (email, password_hash, name, role, wilayah_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, email, name, role, wilayah_id, created_at`,
          [parsed.data.email, password_hash, parsed.data.name, parsed.data.role, parsed.data.wilayah_id ?? null]
        );
        return r.rows[0];
      });

      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: admin.sub,
        action: "user_create",
        objectType: "user",
        objectId: inserted.id,
        after: { email: inserted.email, name: inserted.name, role: inserted.role },
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_create", err: e }));

      return c.json(inserted, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return c.json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already registered" } }, 409);
      }
      throw e;
    }
  }),
);

adminUsersRoute.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const userId = c.req.param("id");

    const body = await c.req.json();
    const parsed = AdminUserUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
    }

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, email, name, role, disabled FROM users WHERE id = $1`,
        [userId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }

    const updates: string[] = [];
    const values: (string | boolean)[] = [];

    if (parsed.data.role !== undefined) {
      values.push(parsed.data.role);
      updates.push(`role = $${values.length}`);
    }
    if (parsed.data.password !== undefined) {
      const password_hash = await hashPassword(parsed.data.password);
      values.push(password_hash);
      updates.push(`password_hash = $${values.length}`);
    }
    if (parsed.data.disabled !== undefined) {
      values.push(parsed.data.disabled);
      updates.push(`disabled = $${values.length}`);
    }

    values.push(userId);
    const updated = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, email, name, role, wilayah_id, disabled, created_at, updated_at`,
        values
      );
      return r.rows[0];
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: admin.sub,
      action: "user_update",
      objectType: "user",
      objectId: userId,
      before: { role: before.role },
      after: { role: updated.role, disabled: updated.disabled },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_update", err: e }));

    return c.json(updated);
  }),
);

adminUsersRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const userId = c.req.param("id");

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, email, name, role, disabled FROM users WHERE id = $1`,
        [userId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }

    await withClient(c.env, async (client: PgClient) => {
      await client.query(
        `UPDATE users SET disabled = true, updated_at = NOW() WHERE id = $1`,
        [userId]
      );
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: admin.sub,
      action: "user_disable",
      objectType: "user",
      objectId: userId,
      before: { disabled: before.disabled },
      after: { disabled: true },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_disable", err: e }));

    return c.json({ message: "User disabled successfully" });
  }),
);

adminUsersRoute.patch(
  "/:id/deactivate",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const userId = c.req.param("id");

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, email, name, role, disabled FROM users WHERE id = $1`,
        [userId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }

    await withClient(c.env, async (client: PgClient) => {
      await client.query(
        `UPDATE users SET disabled = true, updated_at = NOW() WHERE id = $1`,
        [userId]
      );
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: admin.sub,
      action: "user_deactivate",
      objectType: "user",
      objectId: userId,
      before: { disabled: before.disabled },
      after: { disabled: true },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_deactivate", err: e }));

    return c.json({ message: "User deactivated successfully" });
  }),
);

adminUsersRoute.patch(
  "/:id/reactivate",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const userId = c.req.param("id");

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, email, name, role, disabled FROM users WHERE id = $1`,
        [userId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }

    await withClient(c.env, async (client: PgClient) => {
      await client.query(
        `UPDATE users SET disabled = false, updated_at = NOW() WHERE id = $1`,
        [userId]
      );
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: admin.sub,
      action: "user_reactivate",
      objectType: "user",
      objectId: userId,
      before: { disabled: before.disabled },
      after: { disabled: false },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_reactivate", err: e }));

    return c.json({ message: "User reactivated successfully" });
  }),
);
