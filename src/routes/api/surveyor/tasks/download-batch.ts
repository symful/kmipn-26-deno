import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const surveyorTasksDownloadBatchRoute = new Hono<{ Bindings: Env }>();

surveyorTasksDownloadBatchRoute.post("/", requireAuth, requireRole("SURVEYOR"), safeHandler(async (c) => {
  const body = await c.req.json();
  const taskIds: string[] = body.task_ids || [];

  if (!taskIds.length || taskIds.length > 50) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "task_ids must have 1-50 items" } },
      400
    );
  }

  const user = c.get("user");

  const result = await withClient(c.env, async (client) => {
    // Get tasks with full details
    const tasksR = await client.query(
      `SELECT st.id, st.report_id, st.instructions, st.deadline,
              r.description, r.lat, r.lng, r.address, r.photo_urls,
              c.name as category_name,
              c.slug as category_slug,
              st.accepted_at, st.started_at
       FROM surveyor_tasks st
       JOIN reports r ON r.id = st.report_id
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE st.id = ANY($1) AND st.surveyor_id = $2
       AND st.status IN ('assigned', 'in_progress')`,
      [taskIds, user.sub]
    );

    // Record downloads
    for (const taskId of taskIds) {
      await client.query(
        `INSERT INTO surveyor_task_downloads (task_id, downloaded_by, downloaded_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (task_id, downloaded_by) DO UPDATE SET downloaded_at = NOW()`,
        [taskId, user.sub]
      );
    }

    // Get checklist templates for each task
    const tasks = await Promise.all(
      tasksR.rows.map(async (task: any) => {
        const checklistR = await client.query(
          `SELECT id, item, required FROM surveyor_checklist_templates
           WHERE category_id = $1 AND is_active = true
           ORDER BY id`,
          [task.category_id]
        );

        // Estimate size
        const photoCount = (task.photo_urls || []).length;
        const estimatedSizeBytes = photoCount * 500000 + 50000; // ~500KB per photo + 50KB base

        return {
          ...task,
          checklist: checklistR.rows,
          estimated_size_bytes: estimatedSizeBytes,
        };
      })
    );

    const totalSizeBytes = tasks.reduce(
      (sum: number, t: any) => sum + t.estimated_size_bytes,
      0
    );

    return {
      tasks,
      total_size_bytes: totalSizeBytes,
      manifest_url: null as string | null,
    };
  });

  return c.json(result);
}));
