/**
 * Canonical status-transition engine for SIGAP case/report lifecycle.
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 *   - `canTransition(scope, role, action, from)` pure transition predicate
 *   - `CASE_TRANSITIONS` and `REPORT_TRANSITIONS` rule definitions
 *
 * Complementary layers (NOT replaced by this file):
 *   - capability manifest (T1) → UI permission surface
 *   - status machine (this file) → state-transition legality enforcement
 */

export type Role = "ADMIN" | "PETUGAS" | "WARGA";

export interface TransitionRule {
  scope: "case" | "report" | "task";
  role: Role;
  action: string;
  from: string;
  to?: string;
  requires?: {
    unit_id?: boolean;
    into_case_id?: boolean;
    report_perlu_dilengkapi?: boolean;
  };
}

export const CASE_TRANSITIONS: TransitionRule[] = [
  {
    scope: "case",
    role: "ADMIN",
    action: "verify",
    from: "MENUNGGU_VERIFIKASI",
    to: "TERVERIFIKASI",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "reject",
    from: "MENUNGGU_VERIFIKASI",
    to: "DITOLAK",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "request_info",
    from: "MENUNGGU_VERIFIKASI",
    to: "MENUNGGU_VERIFIKASI",
    requires: { report_perlu_dilengkapi: true },
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "prioritize",
    from: "*",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "assign",
    from: "*",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "merge",
    from: "*",
    to: "DUPLIKAT",
    requires: { into_case_id: true },
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "dispatch",
    from: "TERVERIFIKASI",
    to: "SEDANG_DITANGANI",
    requires: { unit_id: true },
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "close",
    from: "SEDANG_DITANGANI",
    to: "SELESAI",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "mark_incomplete",
    from: "MENUNGGU_VERIFIKASI",
    to: "PERLU_KELENGKAPAN",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "mark_incomplete",
    from: "TERVERIFIKASI",
    to: "PERLU_KELENGKAPAN",
  },
  {
    scope: "case",
    role: "ADMIN",
    action: "sla_breach",
    from: "MENUNGGU_VERIFIKASI",
    to: "SLA_TERLEWAT",
  },
];

export const REPORT_TRANSITIONS: TransitionRule[] = [
  {
    scope: "report",
    role: "WARGA",
    action: "submit",
    from: "DRAFT",
    to: "SUBMITTED",
  },
  {
    scope: "report",
    role: "WARGA",
    action: "lengkapi",
    from: "PERLU_DILENGKAPI",
    to: "SUBMITTED",
  },
];

export const TASK_TRANSITIONS: TransitionRule[] = [
  {
    scope: "task",
    role: "PETUGAS",
    action: "accept",
    from: "PENDING",
    to: "IN_PROGRESS",
  },
  {
    scope: "task",
    role: "PETUGAS",
    action: "start",
    from: "PENDING",
    to: "IN_PROGRESS",
  },
  {
    scope: "task",
    role: "PETUGAS",
    action: "submit_result",
    from: "IN_PROGRESS",
    to: "COMPLETED",
  },
  {
    scope: "task",
    role: "PETUGAS",
    action: "reject",
    from: "IN_PROGRESS",
    to: "NEEDS_CLARIFICATION",
  },
  {
    scope: "task",
    role: "PETUGAS",
    action: "clarify",
    from: "IN_PROGRESS",
    to: "NEEDS_CLARIFICATION",
  },
];

export function canTransition(
  scope: "case" | "report" | "task",
  role: Role,
  action: string,
  from: string,
):
  | { ok: true; to?: string; requires?: TransitionRule["requires"] }
  | { ok: false } {
  let rules: TransitionRule[];
  if (scope === "case") rules = CASE_TRANSITIONS;
  else if (scope === "report") rules = REPORT_TRANSITIONS;
  else rules = TASK_TRANSITIONS;
  const rule = rules.find(
    (r) =>
      r.role === role &&
      r.action === action &&
      (r.from === "*" || r.from === from),
  );
  if (!rule) return { ok: false };
  const out: { ok: true; to?: string; requires?: TransitionRule["requires"] } =
    { ok: true };
  if (rule.to !== undefined) out.to = rule.to;
  if (rule.requires !== undefined) out.requires = rule.requires;
  return out;
}

export function getAllowedCaseActions(role: Role, status: string): string[] {
  return CASE_TRANSITIONS.filter(
    (r) => r.role === role && (r.from === "*" || r.from === status),
  ).map((r) => r.action);
}

export function getAllowedReportActions(role: Role, status: string): string[] {
  return REPORT_TRANSITIONS.filter(
    (r) => r.role === role && (r.from === "*" || r.from === status),
  ).map((r) => r.action);
}

export function getAllowedTaskActions(role: Role, status: string): string[] {
  return TASK_TRANSITIONS.filter(
    (r) => r.role === role && (r.from === "*" || r.from === status),
  ).map((r) => r.action);
}

export const TRANSITION_LABELS: Record<string, { en: string; id: string }> = {
  verify: { en: "Verify", id: "Verifikasi" },
  reject: { en: "Reject", id: "Tolak" },
  merge: { en: "Merge", id: "Gabung" },
  separate: { en: "Separate", id: "Pisahkan" },
  dispatch: { en: "Dispatch", id: "Dispatch" },
  close: { en: "Close", id: "Tutup" },
  reopen: { en: "Reopen", id: "Buka Kembali" },
  submit: { en: "Submit", id: "Kirim" },
  lengkapi: { en: "Complete", id: "Lengkapi" },
  request_info: { en: "Request Info", id: "Minta Info" },
  prioritize: { en: "Prioritize", id: "Prioritaskan" },
  assign: { en: "Assign", id: "Tugaskan" },
};
