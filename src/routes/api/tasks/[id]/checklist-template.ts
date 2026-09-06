import { checklistLabelEn } from "@/lib/checklist-labels";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const taskChecklistTemplateRoute = new Hono<{ Bindings: Env }>();

taskChecklistTemplateRoute.get(
  "/",
  safeHandler(async (c) => {
    const taskId = c.req.param("id");

    const template = await c.env.D1.prepare(
      `SELECT sct.items
     FROM tasks st
     JOIN reports r ON r.id = st.report_id
     JOIN checklist_templates sct ON sct.category_id = r.category_id
     WHERE st.id = ? ORDER BY sct.version DESC LIMIT 1`,
    )
      .bind(taskId)
      .first();

    if (!template) {
      // No template for this category — return empty items instead of 404
      return c.json({ items: [] });
    }

    let items: Array<{
      item: string;
      required?: boolean;
      is_required?: boolean;
    }> = [];
    try {
      items = JSON.parse((template.items as string) || "[]");
    } catch {
      items = [];
    }

    return c.json({
      items: items.map(
        (
          row: { item: string; required?: boolean; is_required?: boolean },
          index: number,
        ) => ({
          id: row.item || `item-${index}`,
          item: row.item,
          label_en: checklistLabelEn(row.item),
          required: row.required ?? row.is_required ?? true,
        }),
      ),
    });
  }),
);
