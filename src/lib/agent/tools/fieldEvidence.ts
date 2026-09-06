import { z } from "zod";
import { dbId } from "@/lib/schemas";
import type { Env } from "@/types/bindings";
const jsonValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
const tool = {
  name: "collect_field_evidence",
  model: null,
  description:
    "Read actual configured checklist and recorded task/survey evidence; does not infer measurements.",
  inputSchema: z.object({ report_id: dbId }),
  outputSchema: z.object({
    source: z.literal("recorded_database_evidence"),
    tasks: z.array(z.record(z.unknown())),
    visits: z.array(z.record(z.unknown())),
    checklist_template: z.record(z.unknown()).nullable(),
    confidence: z.number(),
    supporting_factors: z.array(z.string()),
    risk_factors: z.array(z.string()),
    correlation_ids: z.array(z.string()),
  }),
  promptBuilder: () => "Deterministic database evidence; no model call.",
  async execute(env: Env, input: { report_id: string }) {
    const report = await env.D1.prepare(
      "SELECT category_id FROM reports WHERE id = ?",
    )
      .bind(input.report_id)
      .first<{ category_id: string }>();
    if (!report) throw new Error("Report not found");
    const [taskRows, visitRows, template] = await Promise.all([
      env.D1.prepare(
        "SELECT id,status,progress_percent,progress_notes,instructions,deadline,verification_status,completion_evidence_urls,completed_at FROM tasks WHERE report_id = ? ORDER BY created_at,id",
      )
        .bind(input.report_id)
        .all<Record<string, unknown>>(),
      env.D1.prepare(
        "SELECT v.id,v.task_id,v.findings,v.checklist,v.photo_urls,v.gps_data,v.created_at FROM task_visits v JOIN tasks t ON t.id=v.task_id WHERE t.report_id = ? ORDER BY v.created_at,v.id",
      )
        .bind(input.report_id)
        .all<Record<string, unknown>>(),
      env.D1.prepare(
        "SELECT id,category_id,version,items FROM checklist_templates WHERE category_id = ? ORDER BY version DESC LIMIT 1",
      )
        .bind(report.category_id)
        .first<Record<string, unknown>>(),
    ]);
    const tasks = taskRows.results.map((row) => ({
      ...row,
      completion_evidence_urls: jsonValue(row.completion_evidence_urls),
    }));
    const visits = visitRows.results.map((row) => ({
      ...row,
      findings: jsonValue(row.findings),
      checklist: jsonValue(row.checklist),
      photo_urls: jsonValue(row.photo_urls),
      gps_data: jsonValue(row.gps_data),
    }));
    return {
      source: "recorded_database_evidence" as const,
      tasks,
      visits,
      checklist_template: template
        ? { ...template, items: jsonValue(template.items) }
        : null,
      confidence: 1,
      supporting_factors: [
        `${tasks.length} tugas dan ${visits.length} kunjungan tercatat pada laporan ini.`,
      ],
      risk_factors: [
        ...(!template
          ? ["Kategori belum memiliki daftar pemeriksaan yang dikonfigurasi."]
          : []),
        ...(!visits.length
          ? [
              "Belum ada hasil survei lapangan tercatat; ukuran dan kondisi lapangan belum dapat dikonfirmasi.",
            ]
          : []),
      ],
      correlation_ids: [
        input.report_id,
        ...taskRows.results.map((row) => String(row.id)),
        ...visitRows.results.map((row) => String(row.id)),
        ...(template ? [String(template.id)] : []),
      ],
    };
  },
};
export default tool;
