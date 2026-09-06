import { Hono } from "hono";
import { appendAudit } from "@/lib/audit";
import { updateCategorySchema } from "@/lib/schemas";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";

const CODE_TO_ICON: Record<string, string> = {
  JL: "construction",
  JB: "water_drop",
  DR: "warning",
  AR: "agriculture",
  LP: "report",
  FP: "forest",
};

export const adminCategoryRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
adminCategoryRoutes.put("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      422,
    );

  const existing = await c.env.D1.prepare(
    "SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "category_not_found" }, 404);
  }

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (parsed.data.name !== undefined) {
    updates.push("name = ?");
    values.push(parsed.data.name);
  }
  if (parsed.data.description !== undefined) {
    updates.push("description = ?");
    values.push(parsed.data.description);
  }
  if (parsed.data.parent_id !== undefined) {
    updates.push("parent_id = ?");
    values.push(parsed.data.parent_id);
  }
  if (parsed.data.code !== undefined) {
    updates.push("code = ?");
    values.push(parsed.data.code);
  }
  if (parsed.data.icon !== undefined) {
    updates.push("icon = ?");
    values.push(parsed.data.icon);
  } else if (parsed.data.code !== undefined && CODE_TO_ICON[parsed.data.code]) {
    updates.push("icon = ?");
    values.push(CODE_TO_ICON[parsed.data.code]!);
  }
  if (parsed.data.short_code !== undefined) {
    updates.push("short_code = ?");
    values.push(parsed.data.short_code);
  } else if (parsed.data.code !== undefined) {
    // Derive short_code from code when short_code not explicitly set
    updates.push("short_code = ?");
    values.push(parsed.data.code);
  }

  if (updates.length === 0) {
    return c.json(
      {
        error: "VALIDATION_ERROR",
        details: { formErrors: ["No fields to update"] },
      },
      422,
    );
  }

  values.push(new Date().toISOString());
  values.push(id);

  const updateResult = await c.env.D1.prepare(
    `UPDATE categories SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(...values)
    .run();

  if (!updateResult.success) {
    return c.json({ error: "update_failed" }, 500);
  }

  const user = c.get("user");
  c.executionCtx.waitUntil(
    appendAudit(c.env, {
      actor: user.sub,
      activeRole: user.role,
      action: "config_change",
      objectType: "category",
      objectId: id,
      reason: `category:update:${id}`,
    }),
  );

  const updated = await c.env.D1.prepare(
    "SELECT id, code, name, parent_id FROM categories WHERE id = ?",
  )
    .bind(id)
    .first();

  return c.json(updated);
});
