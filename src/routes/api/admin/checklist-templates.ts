import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const ChecklistItemSchema = z.object({
  item: z.string().min(1).max(500),
  checked: z.boolean().default(false),
});

const ChecklistTemplateCreateSchema = z.object({
  category_id: z.string().uuid(),
  items: z.array(ChecklistItemSchema).min(1),
});

const ChecklistTemplateUpdateSchema = z.object({
  items: z.array(ChecklistItemSchema).min(1).optional(),
});

const ListTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category_id: z.string().uuid().optional(),
});

export const adminChecklistTemplatesRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /api/admin/checklist-templates - List all templates (paginated)
adminChecklistTemplatesRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const query = ListTemplatesQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, category_id } = query.data;
    const offset = (page - 1) * limit;

    const params: (string | number)[] = [];
    let whereClause = "";
    if (category_id) {
      params.push(category_id);
      whereClause = `WHERE sct.category_id = $${params.length}`;
    }

    const countResult = await withClient(c.env, async (client: PgClient) => {
      return client.query(
        `SELECT COUNT(*) FROM surveyor_checklist_templates sct ${whereClause}`,
        params
      );
    });
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const listResult = await withClient(c.env, async (client: PgClient) => {
      const listQuery = `
        SELECT sct.id, sct.category_id, sct.version, sct.items, sct.created_at,
               c.name as category_name, u.name as created_by_name
        FROM surveyor_checklist_templates sct
        JOIN categories c ON c.id = sct.category_id
        LEFT JOIN users u ON u.id = sct.created_by
        ${whereClause}
        ORDER BY sct.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;
      return client.query(listQuery, params);
    });

    const templates = listResult.rows.map((row) => ({
      id: row.id,
      category_id: row.category_id,
      category_name: row.category_name,
      version: row.version,
      items: row.items,
      created_by: row.created_by_name,
      created_at: row.created_at,
    }));

    return c.json({
      data: templates,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);

// POST /api/admin/checklist-templates - Create a new template
adminChecklistTemplatesRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const body = await c.req.json();
    const parsed = ChecklistTemplateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    // Verify category exists
    const categoryExists = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(`SELECT id FROM categories WHERE id = $1`, [parsed.data.category_id]);
      return r.rows[0];
    });
    if (!categoryExists) {
      return c.json({ error: { code: "CATEGORY_NOT_FOUND", message: "Category not found" } }, 404);
    }

    // Get next version for this category
    const versionResult = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM surveyor_checklist_templates WHERE category_id = $1`,
        [parsed.data.category_id]
      );
      return r.rows[0];
    });
    const nextVersion = versionResult.next_version;

    try {
      const inserted = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query(
          `INSERT INTO surveyor_checklist_templates (category_id, version, items, created_by, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, category_id, version, items, created_at`,
          [parsed.data.category_id, nextVersion, JSON.stringify(parsed.data.items), admin.sub]
        );
        return r.rows[0];
      });

      await appendAudit(c.env, {
        actor: admin.sub,
        action: "checklist_template_create",
        objectType: "checklist_template",
        objectId: inserted.id,
        after: { category_id: inserted.category_id, version: inserted.version },
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "checklist_template_create", err: e }));

      return c.json({
        id: inserted.id,
        category_id: inserted.category_id,
        version: inserted.version,
        items: inserted.items,
        created_at: inserted.created_at,
      }, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return c.json({ error: { code: "DUPLICATE_VERSION", message: "Version already exists for this category" } }, 409);
      }
      throw e;
    }
  }),
);

// PUT /api/admin/checklist-templates/:id - Update a template
adminChecklistTemplatesRoute.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const templateId = c.req.param("id");

    const body = await c.req.json();
    const parsed = ChecklistTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
    }

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, category_id, version, items FROM surveyor_checklist_templates WHERE id = $1`,
        [templateId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (parsed.data.items !== undefined) {
      values.push(JSON.stringify(parsed.data.items));
      updates.push(`items = $${values.length}`);
    }

    if (updates.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No valid fields to update" } }, 400);
    }

    values.push(templateId);
    const updated = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `UPDATE surveyor_checklist_templates SET ${updates.join(", ")}
         WHERE id = $${values.length}
         RETURNING id, category_id, version, items, created_at`,
        values
      );
      return r.rows[0];
    });

    await appendAudit(c.env, {
      actor: admin.sub,
      action: "checklist_template_update",
      objectType: "checklist_template",
      objectId: templateId,
      before: { items: before.items },
      after: { items: updated.items },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "checklist_template_update", err: e }));

    return c.json({
      id: updated.id,
      category_id: updated.category_id,
      version: updated.version,
      items: updated.items,
      created_at: updated.created_at,
    });
  }),
);

// DELETE /api/admin/checklist-templates/:id - Delete a template
adminChecklistTemplatesRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const templateId = c.req.param("id");

    const before = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, category_id, version FROM surveyor_checklist_templates WHERE id = $1`,
        [templateId]
      );
      return r.rows[0];
    });

    if (!before) {
      return c.json({ error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
    }

    await withClient(c.env, async (client: PgClient) => {
      await client.query(`DELETE FROM surveyor_checklist_templates WHERE id = $1`, [templateId]);
    });

    await appendAudit(c.env, {
      actor: admin.sub,
      action: "checklist_template_delete",
      objectType: "checklist_template",
      objectId: templateId,
      before: { category_id: before.category_id, version: before.version },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "checklist_template_delete", err: e }));

    return c.json({ message: "Template deleted successfully" });
  }),
);
