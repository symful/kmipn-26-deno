import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const surveyorChecklistTemplateRoute = new Hono<{ Bindings: Env }>();

surveyorChecklistTemplateRoute.get("/", requireAuth, requireRole("SURVEYOR", "PETUGAS", "ADMIN"), safeHandler(async (c) => {
  const userId = c.get("user").sub;
  const taskId = c.req.param("id");
  if (!taskId) return c.json({ error: { code: "MISSING_TASK_ID", message: "Task ID is required" } }, 400);

  const result = await withClient(c.env, async (client) => {
    const taskRow = await client.query(
      `SELECT r.category_id FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       WHERE st.id = $1 AND st.surveyor_id = $2`,
      [taskId, userId]
    );

    if (!taskRow.rows[0]) {
      return { error: "NOT_FOUND" };
    }

    const { category_id } = taskRow.rows[0] as { category_id: string };

    const templateRow = await client.query(
      `SELECT items FROM surveyor_checklist_templates
       WHERE category_id = $1 ORDER BY version DESC LIMIT 1`,
      [category_id]
    );

    if (!templateRow.rows[0]) {
      return { error: "TEMPLATE_NOT_FOUND" };
    }

    return { checklist: templateRow.rows[0].items };
  });

  if (result && (result as { error?: string }).error === "NOT_FOUND") {
    return c.json({ error: { code: "NOT_FOUND", message: "Task not found or not assigned to you" } }, 404);
  }

  if (result && (result as { error?: string }).error === "TEMPLATE_NOT_FOUND") {
    return c.json({ error: { code: "TEMPLATE_NOT_FOUND", message: "No checklist template found for this category" } }, 404);
  }

  return c.json(result);
}));