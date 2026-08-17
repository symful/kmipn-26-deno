import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";
import { flattenAssessment } from "@/lib/agent/store";

export const verifikatorCaseRoute = new Hono<{ Bindings: Env }>();

verifikatorCaseRoute.get("/", requireAuth, requireRole("VERIFIKATOR", "ADMIN"), safeHandler(async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  const result = await withClient(c.env, async (client) => {
    const report = await client.query(
      `SELECT id, category_id, description, ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat,
              status, severity, photo_urls, rt_rw_verdict, rt_rw_reason, rt_rw_at,
              created_at, updated_at
       FROM reports WHERE id = $1`,
      [id]
    );
    if (!report.rows[0]) return null;
    const assessments = await client.query(
      `SELECT assessment_kind, assessment_status, confidence, result, created_at
       FROM agent_assessments WHERE report_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    const visits = await client.query(
      `SELECT id, surveyor_id, findings, checklist, photo_urls, created_at
       FROM survey_visits WHERE task_id IN (SELECT id FROM surveyor_tasks WHERE report_id = $1)`,
      [id]
    );
    const audit = await client.query(
      `SELECT action, actor, created_at, before_data, after_data
       FROM audit_log WHERE object_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );
    return { report: report.rows[0], assessments: assessments.rows.map(flattenAssessment), visits: visits.rows, audit: audit.rows };
  });
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
  return c.json(result);
}));
