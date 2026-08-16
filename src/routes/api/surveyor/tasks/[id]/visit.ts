import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const surveyorVisitRoute = new Hono<{ Bindings: Env }>();

surveyorVisitRoute.post("/", requireAuth, requireRole("SURVEYOR"), safeHandler(async (c) => {
  const taskId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json();

  // Accept new structured fields
  const {
    findings,
    checklist,
    photo_urls,
    condition_assessment, // ringan | berat | kritis
    recommendation,       // valid_needs_followup | not_found
    gps,                  // { lat, lng, accuracy_m }
    notes,
  } = body;

  const result = await withClient(c.env, async (client) => {
    // Insert visit record
    const visitR = await client.query(
      `INSERT INTO survey_visits (task_id, surveyor_id, findings, checklist, photo_urls, gps_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, created_at`,
      [taskId, user.sub, findings, checklist || [], photo_urls || [], gps || null]
    );

    // Update task with structured fields if provided
    if (condition_assessment || recommendation || notes) {
      const updateFields: string[] = [];
      const updateParams: unknown[] = [];
      let idx = 1;

      if (condition_assessment) {
        updateFields.push(`progress_notes = $${idx++}`);
        updateParams.push(`condition_assessment=${condition_assessment}`);
      }
      if (recommendation) {
        updateFields.push(`verification_status = $${idx++}`);
        updateParams.push(recommendation);
      }
      if (notes) {
        updateFields.push(`progress_notes = COALESCE(progress_notes || ' | ', '') || $${idx++}`);
        updateParams.push(notes);
      }
      updateFields.push(`progress_percent = $${idx++}`);
      updateParams.push(condition_assessment === 'kritis' ? 100 : condition_assessment === 'berat' ? 66 : 33);
      updateParams.push(taskId);

      await client.query(
        `UPDATE surveyor_tasks SET ${updateFields.join(", ")} WHERE id = $${idx}`,
        updateParams
      );
    }

    return visitR.rows[0];
  });

  return c.json({ visit_id: result.id, created_at: result.created_at });
}));
