import { REPORT_AREA_SQL } from "@/lib/report-area";
import { checklistLabelEn } from "@/lib/checklist-labels";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import {
  normalizeReportPhotoUrls,
  normalizeReportsPhotoUrls,
} from "@/lib/photo-urls";

export const taskDetailRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

taskDetailRoute.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const taskId = c.req.param("id");
    if (!taskId)
      return c.json(
        {
          error: {
            code: "MISSING_TASK_ID",
            message: "Pilih tugas dari daftar terlebih dahulu.",
          },
        },
        400,
      );

    const taskResult = await c.env.D1.prepare(
      `SELECT st.id, st.assigned_to, st.worker_id, st.report_id, st.status, st.deadline,
            tm.task_type,
            st.progress_percent, st.progress_notes, st.estimated_completion,
            st.instructions, st.unit_id,
            st.accepted_at, st.started_at, st.completed_at,
            st.verification_status, st.verified_by, st.verified_at, st.completion_evidence_urls, st.resolution_evidence_urls,
            st.created_at, st.updated_at,
            r.description AS report_description, r.title AS report_title, r.lng, r.lat, r.photo_urls,
            r.severity, ${REPORT_AREA_SQL} AS report_address, r.category_id,
            r.created_at AS report_created_at, r.status AS report_status,
            'TGS-' || UPPER(SUBSTR(REPLACE(st.id, '-', ''), 1, 8)) AS code,
            (julianday(st.deadline) - julianday('now')) * 24 AS sla_hours_remaining,
            CASE
              WHEN r.severity >= 75 OR r.priority >= 4 OR (st.deadline IS NOT NULL AND st.deadline < datetime('now', '+24 hours')) THEN 'tinggi'
              WHEN r.severity >= 50 OR (st.deadline IS NOT NULL AND st.deadline < datetime('now', '+48 hours')) THEN 'sedang'
              ELSE 'rendah'
            END AS priority,
            c.name AS category_name, c.slug AS category_slug,
            u.nama AS unit_name, assigned_user.name AS assigned_to_name, worker_user.name AS worker_name
     FROM tasks st
     JOIN reports r ON r.id = st.report_id
     LEFT JOIN categories c ON c.id = r.category_id
      LEFT JOIN units u ON u.id = st.unit_id
     LEFT JOIN users assigned_user ON assigned_user.id = st.assigned_to
     LEFT JOIN users worker_user ON worker_user.id = st.worker_id
      LEFT JOIN task_metadata tm ON tm.task_id = st.id
      WHERE st.id = ?`,
    )
      .bind(taskId)
      .first<Record<string, unknown>>();

    const task = taskResult ?? null;

    if (!task) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message:
              "Tugas tidak ditemukan atau tidak tersedia untuk akun Anda.",
          },
        },
        404,
      );
    }

    const assignedTo = task.assigned_to as string | null;
    const workerId = task.worker_id as string | null;
    const userId = user.sub;
    const role = user.role;

    const unclaimedUnitTask =
      assignedTo === null && workerId === null && task.unit_id != null;
    if (
      role === "PETUGAS" &&
      assignedTo !== userId &&
      workerId !== userId &&
      !unclaimedUnitTask
    ) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message:
              "Tugas tidak ditemukan atau tidak tersedia untuk akun Anda.",
          },
        },
        404,
      );
    }

    const normalizedTask = normalizeReportPhotoUrls(task);

    const clarificationsResult = await c.env.D1.prepare(
      `SELECT id, message, created_at
     FROM task_clarifications
     WHERE task_id = ?
     ORDER BY created_at DESC`,
    )
      .bind(taskId)
      .all<Record<string, unknown>>();

    const clarifications = clarificationsResult.results ?? [];

    const evidenceResult = await c.env.D1.prepare(
      `SELECT id, photo_urls, notes, role, created_at
     FROM task_evidence
     WHERE task_id = ?
     ORDER BY created_at DESC`,
    )
      .bind(taskId)
      .all<Record<string, unknown>>();

    const evidence = evidenceResult.results ?? [];
    const visitsResult = await c.env.D1.prepare(
      `SELECT id, worker_id, findings, checklist, photo_urls, gps_data, created_at
     FROM task_visits WHERE task_id = ? ORDER BY created_at DESC`,
    )
      .bind(taskId)
      .all<Record<string, unknown>>();
    const visits = (visitsResult.results ?? []).map((visit) => {
      let survey: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(visit.findings ?? "null"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          survey = parsed;
      } catch {
        /* Older visits contain plain text findings. */
      }
      return { ...visit, ...survey };
    });

    const checklistResult = await c.env.D1.prepare(
      `SELECT sct.items
     FROM tasks st
     JOIN reports r ON r.id = st.report_id
     JOIN checklist_templates sct ON sct.category_id = r.category_id
     WHERE st.id = ? ORDER BY sct.version DESC LIMIT 1`,
    )
      .bind(taskId)
      .first<{ items: string | null }>();

    let checklist: Array<{ id: string; item: string; required: boolean }> = [];
    if (checklistResult?.items) {
      try {
        const parsed = JSON.parse(checklistResult.items ?? "[]");
        checklist = (Array.isArray(parsed) ? parsed : []).map(
          (
            row: { item: string; required?: boolean; is_required?: boolean },
            index: number,
          ) => ({
            id: row.item || `item-${index}`,
            item: row.item,
            label_en: checklistLabelEn(row.item),
            required: row.required ?? row.is_required ?? true,
          }),
        );
      } catch {
        checklist = [];
      }
    }

    return c.json({
      task: { ...normalizedTask, checklist },
      clarifications,
      evidence: normalizeReportsPhotoUrls(
        evidence as { photo_urls?: unknown }[],
      ),
      visits: normalizeReportsPhotoUrls(visits),
    });
  }),
);
