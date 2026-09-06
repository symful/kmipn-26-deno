import { appendAudit } from "@/lib/audit";
import type { AuditEntry } from "@/lib/audit";
import type { Env } from "@/types/bindings";

export async function auditReportChange(
  env: Env,
  userId: string,
  reportId: string,
  action:
    | "report_create"
    | "report_update"
    | "report_delete"
    | "ai_assessment"
    | "surveyor_visit"
    | "verifikator_accept"
    | "verifikator_combine"
    | "verifikator_separate"
    | "verifikator_reject"
    | "report_closed"
    | "report_assigned"
    | "report_resolved"
    | "report_escalated"
    | "verifikator_decide_valid"
    | "verifikator_decide_needs_completion"
    | "verifikator_decide_needs_survey"
    | "verifikator_decide_duplicate"
    | "verifikator_decide_out_of_scope"
    | "verifikator_decide_rejected"
    | "verifikator_sanggahan_accepted"
    | "verifikator_sanggahan_rejected"
    | "verifikator_completion_approved"
    | "verifikator_completion_rejected"
    | "report_merge"
    | "admin_separate"
    | "admin_priority_override"
    | "sla_updated"
    | `admin_${"accept" | "combine" | "reject" | "decide_valid" | "decide_needs_completion" | "decide_needs_survey" | "decide_duplicate" | "decide_out_of_scope" | "decide_rejected" | "sanggahan_accepted" | "sanggahan_rejected" | "completion_approved" | "completion_rejected"}`,
  before?: unknown,
  after?: unknown,
  reason?: string,
  actor_role?: string,
): Promise<void> {
  const entry: AuditEntry = {
    actor: userId,
    action,
    objectType: "report",
    objectId: reportId,
    before,
    after,
  };
  if (reason !== undefined) {
    entry.reason = reason;
  }
  if (actor_role !== undefined) {
    entry.actorRole = actor_role;
  }
  await appendAudit(env, entry);
}
