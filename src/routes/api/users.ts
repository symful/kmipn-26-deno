import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { hashPassword, type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJson, parseQuery } from "@/lib/validation";

const UserRole = z.enum(["ADMIN", "PETUGAS", "WARGA"]);
type UserRole = z.infer<typeof UserRole>;

const AdminUserCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  role: UserRole,
});

const AdminUserUpdateSchema = z.object({
  role: UserRole.optional(),
  password: z.string().min(8).max(128).optional(),
  disabled: z.boolean().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: UserRole.optional(),
  search: z.string().max(255).optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const usersRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

usersRoute.get(
  "/",
  safeHandler(async (c) => {
    const { page, limit, role, search, is_active } = parseQuery(
      c,
      ListUsersQuerySchema,
    );
    const offset = (page - 1) * limit;

    const params: (string | number | boolean)[] = [];
    let whereClause = "WHERE 1=1";
    if (role) {
      params.push(role);
      whereClause += ` AND role = ?`;
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      whereClause += ` AND (LOWER(email) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?))`;
    }
    if (is_active !== undefined) {
      params.push(!is_active);
      whereClause += ` AND disabled = ?`;
    }

    let countSql = `SELECT COUNT(*) AS total FROM users ${whereClause}`;
    let listSql = `SELECT id, email, name, role, disabled, created_at, updated_at FROM users ${whereClause} ORDER BY created_at DESC`;
    let countParams = [...params];
    const listParams = [...params];

    listParams.push(limit, offset);
    listSql += ` LIMIT ? OFFSET ?`;

    const countResult = await c.env.D1.prepare(countSql)
      .bind(...countParams)
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const listResult = await c.env.D1.prepare(listSql)
      .bind(...listParams)
      .all();

    return c.json({
      data: listResult.results ?? [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);

usersRoute.post(
  "/",
  safeHandler(async (c) => {
    const admin = c.get("user");
    const { email, password, name, role } = await parseJson(
      c,
      AdminUserCreateSchema,
    );

    const password_hash = await hashPassword(password);

    try {
      const userId = crypto.randomUUID();
      await c.env.D1.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(userId, email, password_hash, name, role)
        .run();
      const inserted = await c.env.D1.prepare(
        `SELECT id, email, name, role, created_at FROM users WHERE id = ?`,
      )
        .bind(userId)
        .first<{
          id: string;
          email: string;
          name: string;
          role: string;
          created_at: string;
        }>();

      if (!inserted) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to retrieve inserted user",
            },
          },
          500,
        );
      }

      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: admin.sub,
          action: "user_create",
          objectType: "user",
          objectId: inserted.id,
          after: {
            email: inserted.email,
            name: inserted.name,
            role: inserted.role,
          },
        }).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            audit_failure: true,
            action: "user_create",
            err: e,
          }),
        ),
      );

      return c.json(inserted, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return c.json(
          {
            error: {
              code: "EMAIL_ALREADY_EXISTS",
              message: "Email already registered",
            },
          },
          409,
        );
      }
      throw e;
    }
  }),
);

usersRoute.patch(
  "/:id",
  safeHandler(async (c) => {
    const admin = c.get("user");
    const userId = c.req.param("id");

    const parsed = await parseJson(c, AdminUserUpdateSchema);
    if (Object.keys(parsed).length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
        400,
      );
    }

    const before = await c.env.D1.prepare(
      `SELECT id, email, name, role, disabled FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{
        id: string;
        email: string;
        name: string;
        role: string;
        disabled: boolean;
      }>();

    if (!before) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }

    if (parsed.status !== undefined) {
      if (parsed.status === "disabled") {
        parsed.disabled = true;
      } else if (parsed.status === "active") {
        parsed.disabled = false;
      }
    }

    const updates: string[] = [];
    const values: (string | boolean)[] = [];

    if (parsed.role !== undefined) {
      values.push(parsed.role);
      updates.push(`role = ?`);
    }
    if (parsed.password !== undefined) {
      const password_hash = await hashPassword(parsed.password);
      values.push(password_hash);
      updates.push(`password_hash = ?`);
    }
    if (parsed.disabled !== undefined) {
      values.push(parsed.disabled);
      updates.push(`disabled = ?`);
    }

    let auditAction = "user_update";
    if (parsed.status !== undefined) {
      auditAction =
        parsed.status === "disabled" ? "user_deactivate" : "user_reactivate";
    }

    values.push(userId);
    await c.env.D1.prepare(
      `UPDATE users SET ${updates.join(", ")}, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(...values)
      .run();
    const updated = await c.env.D1.prepare(
      `SELECT id, email, name, role, disabled, created_at, updated_at FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{
        id: string;
        email: string;
        name: string;
        role: string;
        disabled: boolean;
        created_at: string;
        updated_at: string;
      }>();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: admin.sub,
        action: auditAction,
        objectType: "user",
        objectId: userId,
        before: { role: before.role, disabled: before.disabled },
        after: { role: updated?.role, disabled: updated?.disabled },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: auditAction,
          err: e,
        }),
      ),
    );

    return c.json(updated);
  }),
);

usersRoute.delete(
  "/:id",
  safeHandler(async (c) => {
    const admin = c.get("user");
    const userId = c.req.param("id");

    const before = await c.env.D1.prepare(
      `SELECT id, email, name, role, disabled FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{
        id: string;
        email: string;
        name: string;
        role: string;
        disabled: boolean;
      }>();

    if (!before) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }

    await c.env.D1.prepare(
      `UPDATE users SET disabled = true, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(userId)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: admin.sub,
        action: "user_disable",
        objectType: "user",
        objectId: userId,
        before: { disabled: before.disabled },
        after: { disabled: true },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          action: "user_disable",
          err: e,
        }),
      ),
    );

    return c.json({ message: "User disabled successfully" });
  }),
);
