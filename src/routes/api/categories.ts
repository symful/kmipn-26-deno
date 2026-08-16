import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const CategoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  icon: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  parent_id: z.string().uuid().optional().nullable(),
  code: z.string().max(10).optional(),
  short_code: z.string().max(5).optional(),
  color_class: z.string().max(20).optional(),
});

const CategoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  icon: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  parent_id: z.string().uuid().optional().nullable(),
  code: z.string().max(10).optional(),
  short_code: z.string().max(5).optional(),
  color_class: z.string().max(20).optional(),
});

export const categoriesRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

categoriesRoute.get(
  "/",
  safeHandler(async (c) => {
    const rows = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query("SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE deleted_at IS NULL ORDER BY name");
      return r.rows;
    });
    return c.json({ categories: rows });
  }),
);

categoriesRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = CategoryCreateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);

    // Prevent circular parent references
    if (parsed.data.parent_id) {
      const parentCheck = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query("SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL", [parsed.data.parent_id]);
        return r.rows[0];
      });
      if (!parentCheck) {
        return c.json({ error: { code: "VALIDATION_ERROR", message: "Parent category not found" } }, 400);
      }
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `INSERT INTO categories (name, slug, icon, description, parent_id, code, short_code, color_class, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at`,
        [parsed.data.name, parsed.data.slug, parsed.data.icon ?? null, parsed.data.description ?? null, parsed.data.parent_id ?? null, parsed.data.code ?? null, parsed.data.short_code ?? null, parsed.data.color_class ?? null]
      );
      return r.rows[0];
    });

    const user = c.get("user");
    await appendAudit(c.env, {
      actor: user.sub,
      action: "category_create",
      objectType: "category",
      objectId: result.id,
      before: null,
      after: { name: result.name, slug: result.slug, icon: result.icon, description: result.description, parent_id: result.parent_id, code: result.code, short_code: result.short_code, color_class: result.color_class },
    }).catch((e) => logger.error({ route: "/api/categories", method: "POST", context: "audit_write_failed", action: "category_create", error: e as Error }));

    return c.json(result, 201);
  }),
);

categoriesRoute.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = CategoryUpdateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);

    if (parsed.data.parent_id === id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Category cannot be its own parent" } }, 400);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (parsed.data.name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(parsed.data.name);
    }
    if (parsed.data.slug !== undefined) {
      updates.push(`slug = $${i++}`);
      values.push(parsed.data.slug);
    }
    if (parsed.data.icon !== undefined) {
      updates.push(`icon = $${i++}`);
      values.push(parsed.data.icon);
    }
    if (parsed.data.description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(parsed.data.description);
    }
    if (parsed.data.parent_id !== undefined) {
      updates.push(`parent_id = $${i++}`);
      values.push(parsed.data.parent_id);
    }
    if (parsed.data.code !== undefined) {
      updates.push(`code = $${i++}`);
      values.push(parsed.data.code);
    }
    if (parsed.data.short_code !== undefined) {
      updates.push(`short_code = $${i++}`);
      values.push(parsed.data.short_code);
    }
    if (parsed.data.color_class !== undefined) {
      updates.push(`color_class = $${i++}`);
      values.push(parsed.data.color_class);
    }

    if (updates.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const user = c.get("user");

    const result = await withClient(c.env, async (client: PgClient) => {
      const beforeResult = await client.query(
        "SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      const before = beforeResult.rows[0];

      if (!before) return null;

      const r = await client.query(
        `UPDATE categories SET ${updates.join(", ")} WHERE id = $${i} AND deleted_at IS NULL RETURNING id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at`,
        values
      );
      const after = r.rows[0];

      await appendAudit(c.env, {
        actor: user.sub,
        action: "category_update",
        objectType: "category",
        objectId: id,
        before: { name: before.name, slug: before.slug, icon: before.icon, description: before.description, parent_id: before.parent_id, code: before.code, short_code: before.short_code, color_class: before.color_class },
        after: { name: after.name, slug: after.slug, icon: after.icon, description: after.description, parent_id: after.parent_id, code: after.code, short_code: after.short_code, color_class: after.color_class },
      }).catch((e) => logger.error({ route: "/api/categories", method: "PATCH", context: "audit_write_failed", action: "category_update", error: e as Error }));

      return after;
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Category not found" } }, 404);
    }

    return c.json(result);
  }),
);

categoriesRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const result = await withClient(c.env, async (client: PgClient) => {
      const beforeResult = await client.query(
        "SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      const before = beforeResult.rows[0];

      if (!before) return null;

      const r = await client.query(
        `UPDATE categories SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id]
      );
      const deleted = r.rows[0];

      if (deleted) {
        await appendAudit(c.env, {
          actor: user.sub,
          action: "category_delete",
          objectType: "category",
          objectId: id,
          before: { name: before.name, slug: before.slug, icon: before.icon, description: before.description, parent_id: before.parent_id, code: before.code, short_code: before.short_code, color_class: before.color_class },
          after: null,
        }).catch((e) => logger.error({ route: "/api/categories", method: "DELETE", context: "audit_write_failed", action: "category_delete", error: e as Error }));
      }

      return deleted;
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Category not found or already deleted" } }, 404);
    }

    return c.json({ success: true });
  }),
);