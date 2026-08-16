import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const surveyorChecklistTemplateRoute = new Hono<{ Bindings: Env }>();

surveyorChecklistTemplateRoute.get("/", requireAuth, requireRole("SURVEYOR", "PETUGAS"), safeHandler(async (c) => {
  const taskId = c.req.param("id");

  const template = await withClient(c.env, async (client) => {
    // Get category_id from task
    const taskR = await client.query(
      `SELECT r.category_id FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       WHERE st.id = $1`,
      [taskId]
    );

    if (!taskR.rows[0]) {
      return null;
    }

    const categoryId = taskR.rows[0].category_id;

    // Get checklist items - the items JSONB has {item, required} structure
    const r = await client.query(
      `SELECT id, item, required, is_required
       FROM surveyor_checklist_templates
       WHERE category_id = $1 AND is_active = true
       ORDER BY id`,
      [categoryId]
    );

    return r.rows.map((row: any) => ({
      id: row.id,
      item: row.item,
      required: row.required ?? row.is_required ?? true,
      is_required: row.is_required ?? row.required ?? true,
    }));
  });

  if (!template) {
    return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
  }

  return c.json({ items: template });
}));
