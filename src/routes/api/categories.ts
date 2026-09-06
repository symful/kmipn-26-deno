import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { dbId } from "@/lib/schemas";
import { generateId } from "@/lib/id";

const DEFAULT_SURVEY_ACTIONS = [
  "Foto kondisi dari 3 sudut",
  "Ukur perkiraan dimensi",
  "Tandai koordinat presisi",
].map((item) => ({ item, required: true }));

const CategoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  icon: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  parent_id: dbId.optional().nullable(),
  code: z.string().max(10).optional(),
  short_code: z.string().max(5).optional(),
  color_class: z.string().max(20).optional(),
});

const CategoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  icon: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  parent_id: dbId.optional().nullable(),
  code: z.string().max(10).optional(),
  short_code: z.string().max(5).optional(),
  color_class: z.string().max(20).optional(),
});

const CODE_TO_ICON: Record<string, string> = {
  JL: "construction",
  JB: "water_drop",
  DR: "warning",
  AR: "agriculture",
  LP: "report",
  FP: "forest",
};

export const categoriesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

categoriesRoute.get(
  "/",
  safeHandler(async (c) => {
    const rows = await c.env.D1.prepare(
      "SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE deleted_at IS NULL ORDER BY CASE name WHEN 'Jalan' THEN 0 WHEN 'Jembatan' THEN 1 WHEN 'Air Bersih' THEN 2 WHEN 'Fasilitas Umum' THEN 3 WHEN 'Irigasi' THEN 4 ELSE 5 END, name",
    ).all();
    return c.json({ data: rows.results ?? [] });
  }),
);

categoriesRoute.post(
  "/",
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = CategoryCreateSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        },
        400,
      );

    // Prevent circular parent references
    if (parsed.data.parent_id) {
      const parentCheck = await c.env.D1.prepare(
        "SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL",
      )
        .bind(parsed.data.parent_id)
        .first();
      if (!parentCheck) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Parent category not found",
            },
          },
          400,
        );
      }
    }

    const categoryId = generateId();

    const shortCode = parsed.data.short_code ?? parsed.data.code ?? null;
    const icon =
      parsed.data.icon ??
      (parsed.data.code ? (CODE_TO_ICON[parsed.data.code] ?? null) : null);

    await c.env.D1.prepare(
      `INSERT INTO categories (id, name, slug, icon, description, parent_id, code, short_code, color_class, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        categoryId,
        parsed.data.name,
        parsed.data.slug,
        icon,
        parsed.data.description ?? null,
        parsed.data.parent_id ?? null,
        parsed.data.code ?? null,
        shortCode,
        parsed.data.color_class ?? null,
      )
      .run();

    await c.env.D1.prepare(
      "INSERT INTO checklist_templates(id,category_id,version,items,created_by) VALUES(?,?,1,?,?)",
    )
      .bind(
        generateId(),
        categoryId,
        JSON.stringify(DEFAULT_SURVEY_ACTIONS),
        c.get("user").sub,
      )
      .run();
    const inserted = await c.env.D1.prepare(
      `SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE id = ?`,
    )
      .bind(categoryId)
      .first();

    const user = c.get("user");
    c.executionCtx.waitUntil(
      (async () => {
        if (!inserted) {
          logger.error({
            route: "/api/categories",
            method: "POST",
            context: "audit_skip_d1_lag",
            action: "category_create",
            categoryId,
          });
          return;
        }
        await appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: user.sub,
          action: "category_create",
          objectType: "category",
          objectId: categoryId,
          before: null,
          after: {
            name: inserted.name,
            slug: inserted.slug,
            icon: inserted.icon,
            description: inserted.description,
            parent_id: inserted.parent_id,
            code: inserted.code,
            short_code: inserted.short_code,
            color_class: inserted.color_class,
          },
        });
      })().catch((e) =>
        logger.error({
          route: "/api/categories",
          method: "POST",
          context: "audit_write_failed",
          action: "category_create",
          error: e as Error,
        }),
      ),
    );

    return c.json(inserted, 201);
  }),
);

categoriesRoute.patch(
  "/:id",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = CategoryUpdateSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        },
        400,
      );

    if (parsed.data.parent_id === id) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Category cannot be its own parent",
          },
        },
        400,
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (parsed.data.name !== undefined) {
      updates.push(`name = ?`);
      values.push(parsed.data.name);
    }
    if (parsed.data.slug !== undefined) {
      updates.push(`slug = ?`);
      values.push(parsed.data.slug);
    }
    if (parsed.data.icon !== undefined) {
      updates.push(`icon = ?`);
      values.push(parsed.data.icon);
    } else if (
      parsed.data.code !== undefined &&
      CODE_TO_ICON[parsed.data.code]
    ) {
      updates.push(`icon = ?`);
      values.push(CODE_TO_ICON[parsed.data.code]);
    }
    if (parsed.data.description !== undefined) {
      updates.push(`description = ?`);
      values.push(parsed.data.description);
    }
    if (parsed.data.parent_id !== undefined) {
      updates.push(`parent_id = ?`);
      values.push(parsed.data.parent_id);
    }
    if (parsed.data.code !== undefined) {
      updates.push(`code = ?`);
      values.push(parsed.data.code);
    }
    if (parsed.data.short_code !== undefined) {
      updates.push(`short_code = ?`);
      values.push(parsed.data.short_code);
    } else if (parsed.data.code !== undefined) {
      // Derive short_code from code when short_code not explicitly set
      updates.push(`short_code = ?`);
      values.push(parsed.data.code);
    }
    if (parsed.data.color_class !== undefined) {
      updates.push(`color_class = ?`);
      values.push(parsed.data.color_class);
    }

    if (updates.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
        400,
      );
    }

    updates.push(`updated_at = datetime('now')`);

    const user = c.get("user");

    const before = await c.env.D1.prepare(
      "SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE id = ? AND deleted_at IS NULL",
    )
      .bind(id)
      .first();

    if (!before) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Category not found" } },
        404,
      );
    }

    const updateValues = [...values, id];
    await c.env.D1.prepare(
      `UPDATE categories SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(...updateValues)
      .run();

    const after = await c.env.D1.prepare(
      `SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(id)
      .first();

    c.executionCtx.waitUntil(
      (async () => {
        if (!after) {
          logger.error({
            route: "/api/categories",
            method: "PATCH",
            context: "audit_skip_d1_lag",
            action: "category_update",
            categoryId: id,
          });
          return;
        }
        await appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: user.sub,
          action: "category_update",
          objectType: "category",
          objectId: id,
          before: {
            name: before.name,
            slug: before.slug,
            icon: before.icon,
            description: before.description,
            parent_id: before.parent_id,
            code: before.code,
            short_code: before.short_code,
            color_class: before.color_class,
          },
          after: {
            name: after.name,
            slug: after.slug,
            icon: after.icon,
            description: after.description,
            parent_id: after.parent_id,
            code: after.code,
            short_code: after.short_code,
            color_class: after.color_class,
          },
        });
      })().catch((e) =>
        logger.error({
          route: "/api/categories",
          method: "PATCH",
          context: "audit_write_failed",
          action: "category_update",
          error: e as Error,
        }),
      ),
    );

    return c.json(after);
  }),
);

categoriesRoute.delete(
  "/:id",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const before = await c.env.D1.prepare(
      "SELECT id, slug, name, icon, description, parent_id, code, short_code, color_class, created_at FROM categories WHERE id = ? AND deleted_at IS NULL",
    )
      .bind(id)
      .first();

    if (!before) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Category not found or already deleted",
          },
        },
        404,
      );
    }

    await c.env.D1.prepare(
      `UPDATE categories SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(id)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "category_delete",
        objectType: "category",
        objectId: id,
        before: {
          name: before.name,
          slug: before.slug,
          icon: before.icon,
          description: before.description,
          parent_id: before.parent_id,
          code: before.code,
          short_code: before.short_code,
          color_class: before.color_class,
        },
        after: null,
      }).catch((e) =>
        logger.error({
          route: "/api/categories",
          method: "DELETE",
          context: "audit_write_failed",
          action: "category_delete",
          error: e as Error,
        }),
      ),
    );

    return c.json({ success: true });
  }),
);

const ChecklistConfigurationSchema = z.object({
  items: z
    .array(
      z.object({
        item: z.string().min(1).max(300),
        required: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(50),
});
categoriesRoute.get(
  "/:id/checklist-template",
  safeHandler(async (c) => {
    if (c.get("user").role !== "ADMIN")
      return c.json(
        { error: { code: "FORBIDDEN", message: "Admin access required" } },
        403,
      );
    const categoryId = c.req.param("id");
    if (
      !(await c.env.D1.prepare("SELECT id FROM categories WHERE id=?")
        .bind(categoryId)
        .first())
    )
      return c.json(
        { error: { code: "NOT_FOUND", message: "Category not found" } },
        404,
      );
    const row = await c.env.D1.prepare(
      "SELECT id,version,items FROM checklist_templates WHERE category_id=? ORDER BY version DESC LIMIT 1",
    )
      .bind(categoryId)
      .first<{ id: string; version: number; items: string }>();
    return c.json(
      row
        ? { id: row.id, version: row.version, items: JSON.parse(row.items) }
        : { version: null, items: [] },
    );
  }),
);
categoriesRoute.put(
  "/:id/checklist-template",
  safeHandler(async (c) => {
    if (c.get("user").role !== "ADMIN")
      return c.json(
        { error: { code: "FORBIDDEN", message: "Admin access required" } },
        403,
      );
    const categoryId = c.req.param("id");
    if (
      !(await c.env.D1.prepare("SELECT id FROM categories WHERE id=?")
        .bind(categoryId)
        .first())
    )
      return c.json(
        { error: { code: "NOT_FOUND", message: "Category not found" } },
        404,
      );
    const parsed = ChecklistConfigurationSchema.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Checklist items are required",
          },
          details: parsed.error.flatten(),
        },
        400,
      );
    const id = generateId();
    await c.env.D1.prepare(
      `INSERT INTO checklist_templates(id,category_id,version,items,created_by) SELECT ?,?,COALESCE(MAX(version),0)+1,?,? FROM checklist_templates WHERE category_id=?`,
    )
      .bind(
        id,
        categoryId,
        JSON.stringify(parsed.data.items),
        c.get("user").sub,
        categoryId,
      )
      .run();
    const saved = await c.env.D1.prepare(
      "SELECT id,version,items FROM checklist_templates WHERE id=?",
    )
      .bind(id)
      .first<{ id: string; version: number; items: string }>();
    return c.json(
      {
        id: saved!.id,
        version: saved!.version,
        items: JSON.parse(saved!.items),
      },
      201,
    );
  }),
);
