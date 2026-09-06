import type { Env } from "@/types/bindings";
import { REPORT_AREA_SQL } from "./report-area";
import { redactPII } from "./csv-redaction";
export type ExportJson =
  | null
  | boolean
  | number
  | string
  | ExportJson[]
  | { [key: string]: ExportJson };
export interface ExportFilters {
  report_id?: string | undefined;
  status?: string | undefined;
  category_id?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}
export interface ExportActor {
  role: string;
  sub: string;
}
export interface ExportVisit {
  id: string;
  task_id: string;
  worker_name: string | null;
  findings: ExportJson;
  checklist: ExportJson;
  gps_data: ExportJson;
  photo_urls: string[];
  created_at: string;
}
export interface ExportTask {
  id: string;
  status: string;
  task_type: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  worker_id: string | null;
  worker_name: string | null;
  unit_name: string | null;
  instructions: string | null;
  progress_percent: number | null;
  progress_notes: string | null;
  deadline: string | null;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  verification_status: string | null;
  verified_at: string | null;
  completion_evidence_urls: string[];
  visits: ExportVisit[];
}
export interface ExportHistory {
  id: string;
  status: string;
  label: string;
  actor_name: string | null;
  occurred_at: string;
}
export interface ExportDecision {
  id: number;
  action: string;
  reason: string | null;
  actor_name: string | null;
  before: ExportJson;
  after: ExportJson;
  created_at: string;
}
export interface ExportAssessment {
  id: string;
  kind: string;
  status: string;
  model_version: string | null;
  rule_version: string | null;
  confidence: number | null;
  supporting_factors: string[];
  risk_factors: string[];
  correlation_ids: string[];
  result: ExportJson;
  created_at: string;
}
export interface ExportPriority {
  computed_score: number;
  override_score: number | null;
  override_reason: string | null;
  computed_at: string | null;
  config_version: number;
  severity_component: number | null;
  population_component: number | null;
  vulnerability_component: number | null;
  sla_component: number | null;
  report_count_component: number | null;
}
export interface ReportExportRow {
  id: string;
  title: string;
  description: string;
  category_id: string;
  category_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  reported_at: string;
  deadline: string | null;
  verified_at: string | null;
  address_area: string | null;
  lat: number | null;
  lng: number | null;
  severity: number | null;
  reported_severity: string | null;
  priority: number | null;
  priority_details: ExportPriority | null;
  impact: ExportJson;
  impact_dampak: string | null;
  population_affected: number | null;
  vulnerability_index: number | null;
  rejection_reason: string | null;
  photo_urls: string[];
  merged_into: string | null;
  history: ExportHistory[];
  decisions: ExportDecision[];
  tasks: ExportTask[];
  assessments: ExportAssessment[];
}
export class ExportLimitError extends Error {}
function text(value: unknown): string | null {
  return typeof value === "string" ? redactPII(value) : null;
}
function number(value: unknown): number | null {
  return value == null
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;
}
function json(value: unknown): ExportJson {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return redactPII(value);
    }
  }
  if (parsed == null) return null;
  if (typeof parsed === "string") return redactPII(parsed);
  if (typeof parsed === "number" || typeof parsed === "boolean") return parsed;
  if (Array.isArray(parsed)) return parsed.map(sanitize);
  if (typeof parsed === "object")
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, sanitize(value)]),
    );
  return null;
}
function sanitize(value: unknown): ExportJson {
  if (typeof value === "string") return redactPII(value);
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]),
    );
  return null;
}
function photos(value: unknown): string[] {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(data)
      ? data.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
function strings(value: unknown): string[] {
  const parsed = json(value);
  return Array.isArray(parsed)
    ? parsed.filter((v): v is string => typeof v === "string")
    : [];
}
export async function loadExportReports(
  env: Env,
  filters: ExportFilters,
  user: ExportActor,
  maxRows = 5000,
): Promise<ReportExportRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (user.role === "WARGA") {
    where.push("r.reporter_id = ?");
    params.push(user.sub);
  } else if (user.role === "PETUGAS") {
    where.push(
      "EXISTS (SELECT 1 FROM tasks access_task WHERE access_task.report_id=r.id AND (access_task.assigned_to=? OR access_task.worker_id=?))",
    );
    params.push(user.sub, user.sub);
  } else if (user.role !== "ADMIN") {
    return [];
  }
  for (const [field, value] of [
    ["id", filters.report_id],
    ["status", filters.status],
    ["category_id", filters.category_id],
  ] as const) {
    if (value) {
      where.push(`r.${field} = ?`);
      params.push(value);
    }
  }
  if (filters.from) {
    where.push("julianday(r.created_at) >= julianday(?)");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("julianday(r.created_at) <= julianday(?)");
    params.push(
      filters.to.length === 10 ? filters.to + "T23:59:59.999Z" : filters.to,
    );
  }
  const rows = await env.D1.prepare(
    `SELECT r.id,r.title,r.description,r.category_id,c.name AS category_name,r.status,r.created_at,r.updated_at,r.reported_at,r.deadline,r.verified_at,${REPORT_AREA_SQL} AS address_area,r.lat,r.lng,r.severity,r.impact,r.impact_dampak,r.population_affected,r.vulnerability_index,r.rejection_reason,r.photo_urls,r.merged_into,
 ps.computed_score,ps.override_score,ps.override_reason,ps.computed_at,ps.config_version,ps.severity_component,ps.population_component,ps.vulnerability_component,ps.sla_component,ps.report_count_component
 FROM reports r LEFT JOIN categories c ON c.id=r.category_id LEFT JOIN priority_scores ps ON ps.report_id=r.id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.created_at DESC,r.id LIMIT ${maxRows + 1}`,
  )
    .bind(...params)
    .all<Record<string, unknown>>();
  if (rows.results.length > maxRows)
    throw new ExportLimitError(
      `Hasil ekspor melebihi ${maxRows} laporan. Gunakan filter yang lebih spesifik; tidak ada laporan yang dipotong.`,
    );
  const output = rows.results.map((r): ReportExportRow => {
    const impact = json(r.impact);
    const priority_details =
      r.computed_score == null
        ? null
        : {
            computed_score: Number(r.computed_score),
            override_score: number(r.override_score),
            override_reason: text(r.override_reason),
            computed_at: text(r.computed_at),
            config_version: Number(r.config_version),
            severity_component: number(r.severity_component),
            population_component: number(r.population_component),
            vulnerability_component: number(r.vulnerability_component),
            sla_component: number(r.sla_component),
            report_count_component: number(r.report_count_component),
          };
    return {
      id: String(r.id),
      title: text(r.title) ?? "",
      description: text(r.description) ?? "",
      category_id: String(r.category_id),
      category_name: text(r.category_name) ?? "",
      status: String(r.status),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      reported_at: String(r.reported_at),
      deadline: text(r.deadline),
      verified_at: text(r.verified_at),
      address_area: text(r.address_area),
      lat: number(r.lat),
      lng: number(r.lng),
      severity: number(r.severity),
      reported_severity:
        impact &&
        typeof impact === "object" &&
        !Array.isArray(impact) &&
        typeof impact.reported_severity === "string"
          ? impact.reported_severity
          : null,
      priority:
        priority_details?.override_score ??
        priority_details?.computed_score ??
        null,
      priority_details,
      impact,
      impact_dampak: text(r.impact_dampak),
      population_affected: number(r.population_affected),
      vulnerability_index: number(r.vulnerability_index),
      rejection_reason: text(r.rejection_reason),
      photo_urls: photos(r.photo_urls),
      merged_into: text(r.merged_into),
      history: [],
      decisions: [],
      tasks: [],
      assessments: [],
    };
  });
  const byId = new Map(output.map((row) => [row.id, row]));
  for (let start = 0; start < output.length; start += 200) {
    const ids = output.slice(start, start + 200).map((row) => row.id),
      marks = ids.map(() => "?").join(",");
    const query = (sql: string) =>
      env.D1.prepare(sql)
        .bind(...ids)
        .all<Record<string, unknown>>();
    const [tasks, visits, history, decisions, assessments] = await Promise.all([
      query(
        `SELECT t.*,tm.task_type,au.name AS assigned_to_name,wu.name AS worker_name,u.nama AS unit_name FROM tasks t LEFT JOIN users au ON au.id=t.assigned_to LEFT JOIN users wu ON wu.id=t.worker_id LEFT JOIN units u ON u.id=t.unit_id LEFT JOIN task_metadata tm ON tm.task_id=t.id WHERE t.report_id IN (${marks}) ORDER BY t.created_at,t.id`,
      ),
      query(
        `SELECT v.*,t.report_id,u.name AS worker_name FROM task_visits v JOIN tasks t ON t.id=v.task_id LEFT JOIN users u ON u.id=v.worker_id WHERE t.report_id IN (${marks}) ORDER BY v.created_at,v.id`,
      ),
      query(
        `SELECT h.*,u.name AS actor_name FROM report_status_history h LEFT JOIN users u ON u.id=h.actor WHERE h.report_id IN (${marks}) ORDER BY h.occurred_at,h.id`,
      ),
      user.role === "ADMIN"
        ? query(
            `SELECT a.*,u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor WHERE a.object_type IN ('report','case') AND a.object_id IN (${marks}) ORDER BY a.created_at,a.id`,
          )
        : Promise.resolve({ results: [] }),
      user.role === "ADMIN"
        ? query(
            `SELECT * FROM agent_assessments WHERE report_id IN (${marks}) ORDER BY created_at,id`,
          )
        : Promise.resolve({ results: [] }),
    ]);
    const taskMap = new Map<string, ExportTask>();
    for (const t of tasks.results) {
      const task: ExportTask = {
        id: String(t.id),
        status: String(t.status),
        task_type: text(t.task_type),
        assigned_to: text(t.assigned_to),
        assigned_to_name: text(t.assigned_to_name),
        worker_id: text(t.worker_id),
        worker_name: text(t.worker_name),
        unit_name: text(t.unit_name),
        instructions: text(t.instructions),
        progress_percent: number(t.progress_percent),
        progress_notes: text(t.progress_notes),
        deadline: text(t.deadline),
        created_at: String(t.created_at),
        accepted_at: text(t.accepted_at),
        started_at: text(t.started_at),
        completed_at: text(t.completed_at),
        verification_status: text(t.verification_status),
        verified_at: text(t.verified_at),
        completion_evidence_urls: photos(t.completion_evidence_urls),
        visits: [],
      };
      byId.get(String(t.report_id))?.tasks.push(task);
      taskMap.set(task.id, task);
    }
    for (const v of visits.results)
      taskMap.get(String(v.task_id))?.visits.push({
        id: String(v.id),
        task_id: String(v.task_id),
        worker_name: text(v.worker_name),
        findings: json(v.findings),
        checklist: json(v.checklist),
        gps_data: json(v.gps_data),
        photo_urls: photos(v.photo_urls),
        created_at: String(v.created_at),
      });
    for (const h of history.results)
      byId.get(String(h.report_id))?.history.push({
        id: String(h.id),
        status: String(h.status),
        label: text(h.label) ?? "",
        actor_name: text(h.actor_name),
        occurred_at: String(h.occurred_at),
      });
    for (const d of decisions.results)
      byId.get(String(d.object_id))?.decisions.push({
        id: Number(d.id),
        action: String(d.action),
        reason: text(d.reason),
        actor_name: text(d.actor_name),
        before: json(d.before_data),
        after: json(d.after_data),
        created_at: String(d.created_at),
      });
    for (const a of assessments.results)
      byId.get(String(a.report_id))?.assessments.push({
        id: String(a.id),
        kind: String(a.assessment_kind),
        status: String(a.assessment_status),
        model_version: text(a.model_version),
        rule_version: text(a.rule_version),
        confidence: number(a.confidence),
        supporting_factors: strings(a.supporting_factors),
        risk_factors: strings(a.risk_factors),
        correlation_ids: photos(a.correlation_ids),
        result: json(a.result),
        created_at: String(a.created_at),
      });
  }
  return output;
}
