import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { flattenAssessment } from "@/lib/agent/store";
import { normalizePhotoUrls } from "@/lib/photo-urls";
import { getPriorityScore } from "@/lib/priority/calculator";

export const caseDetailRoute = new Hono<{ Bindings: Env }>();

caseDetailRoute.get(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );

    const reportRow = await c.env.D1.prepare(
      `SELECT r.id, r.category_id, r.description, r.lng, r.lat,
            r.status, r.severity, r.photo_urls, r.title, r.deadline, r.assigned_to, r.device_id,
            r.kecamatan, r.kelurahan, r.kabupaten, r.provinsi, r.impact_dampak, r.merged_into,
            json_extract(r.impact, '$.reported_severity') AS reported_severity,
            r.created_at, r.updated_at,
            cat.id AS cat_id, cat.name AS cat_name, cat.icon AS cat_icon,
            u.id AS assignee_id, u.name AS assignee_name,
            ps.computed_score AS priority_score,
            CASE
              WHEN ps.computed_score IS NULL THEN 'sedang'
              WHEN ps.computed_score < 40 THEN 'rendah'
              WHEN ps.computed_score < 60 THEN 'sedang'
              WHEN ps.computed_score < 80 THEN 'tinggi'
              ELSE 'kritis'
            END AS priority_bucket,
            (SELECT COUNT(*) FROM reports r2 WHERE r2.merged_into = r.id) AS supporting_count
     FROM reports r
     LEFT JOIN categories cat ON cat.id = r.category_id
     LEFT JOIN users u ON u.id = r.assigned_to
     LEFT JOIN priority_scores ps ON ps.report_id = r.id
     WHERE r.id = ?1`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!reportRow)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        404,
      );

    const assessments = await c.env.D1.prepare(
      `SELECT id, assessment_kind, assessment_status, confidence, result, created_at
     FROM agent_assessments WHERE report_id = ?1 ORDER BY created_at ASC`,
    )
      .bind(id)
      .all();

    const visits = await c.env.D1.prepare(
      `SELECT id, task_id, worker_id AS surveyor_id, findings, checklist, photo_urls, created_at
     FROM task_visits WHERE task_id IN (SELECT id FROM tasks WHERE report_id = ?1) ORDER BY created_at`,
    )
      .bind(id)
      .all();

    const audit = await c.env.D1.prepare(
      `SELECT id, object_id, object_type, action, actor, actor_role, created_at, before_data, after_data, reason
     FROM audit_log WHERE object_id = ?1 ORDER BY created_at DESC LIMIT 20`,
    )
      .bind(id)
      .all();

    const calcResult = await getPriorityScore(c.env, id);
    const supportingReports = await c.env.D1.prepare(
      "SELECT id, title, description, photo_urls, created_at FROM reports WHERE merged_into = ? ORDER BY created_at",
    )
      .bind(id)
      .all<Record<string, unknown>>();
    const totalScore =
      calcResult?.total_score ?? reportRow.priority_score ?? null;

    const report = {
      id: reportRow.id,
      category_id: reportRow.category_id,
      category: reportRow.cat_id
        ? {
            id: reportRow.cat_id,
            name: reportRow.cat_name,
            icon: reportRow.cat_icon,
          }
        : undefined,
      description: reportRow.description,
      title: reportRow.title,
      deadline: reportRow.deadline,
      assigned_to: reportRow.assigned_to,
      device_id: reportRow.device_id,
      kecamatan: reportRow.kecamatan,
      kelurahan: reportRow.kelurahan,
      kabupaten: reportRow.kabupaten,
      provinsi: reportRow.provinsi,
      village_name: reportRow.kelurahan,
      impact_dampak: reportRow.impact_dampak,
      reported_severity: reportRow.reported_severity,
      supporting_case_id: reportRow.merged_into,
      lng: reportRow.lng,
      lat: reportRow.lat,
      geom:
        typeof reportRow.lng === "number" && typeof reportRow.lat === "number"
          ? {
              type: "Point" as const,
              coordinates: [reportRow.lng, reportRow.lat] as [number, number],
            }
          : undefined,
      status: reportRow.status,
      severity: reportRow.severity,
      photo_urls: normalizePhotoUrls(reportRow.photo_urls),
      created_at: reportRow.created_at,
      updated_at: reportRow.updated_at,
      assignee: reportRow.assignee_id
        ? { id: reportRow.assignee_id, name: reportRow.assignee_name }
        : undefined,
      priority_score: totalScore,
      priority_bucket: reportRow.priority_bucket,
      supporting_count: reportRow.supporting_count ?? 0,
      supporting_reports: (supportingReports.results ?? []).map((row) => ({
        ...row,
        photo_urls: normalizePhotoUrls(row.photo_urls),
      })),
    };

    const result = {
      report,
      assessments: (assessments.results ?? []).map(
        (row: Record<string, unknown>) => {
          const flattened = flattenAssessment(
            row as {
              assessment_kind: string;
              assessment_status: string;
              confidence: number;
              result: Record<string, unknown>;
              created_at: Date | string;
            },
          );
          return {
            id: row.id,
            tool_name: flattened.kind,
            status: flattened.status,
            confidence: flattened.confidence,
            result: flattened.result,
            created_at: flattened.created_at,
          };
        },
      ),
      visits: (visits.results ?? []).map((row) => ({
        ...row,
        photo_urls: normalizePhotoUrls(row.photo_urls),
        checklist:
          typeof row.checklist === "string"
            ? JSON.parse(row.checklist)
            : (row.checklist ?? []),
      })),
      audit: (audit.results ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        object_id: row.object_id,
        object_type: row.object_type,
        action: row.action,
        actor: row.actor,
        actor_role: row.actor_role,
        before_data: row.before_data,
        after_data: row.after_data,
        reason: row.reason,
        created_at: row.created_at,
      })),
    };

    return c.json(result);
  }),
);
