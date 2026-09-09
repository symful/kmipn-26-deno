import type { Env } from "@/types/bindings";

/**
 * Each field stores the component's contribution to the final score (0–100).
 * `report_count` now holds the corroboration bonus applied post-sum, NOT a
 * raw merged-report count.  Only independent corroborations from distinct
 * reporters (excluding the original) count toward this bonus.
 */
export interface PriorityBreakdown {
  severity: number;
  impact: number;
  vulnerability: number;
  sla: number;
  report_count: number;
}

/**
 * REPORT_COUNT_CONTRIBUTION_FACTOR — bonus per independent corroboration,
 * applied AFTER the normalised weighted sum.  Each corroborating report
 * from a distinct reporter (excluding the original) adds 2 points, capped
 * at 20.  Independent corroborations only: the SQL query filters
 * contribution_type = 'corroboration' and excludes the original reporter_id.
 */
const REPORT_COUNT_CONTRIBUTION_FACTOR = 2;
const REPORT_COUNT_MAX_CONTRIBUTION = 20;

export interface PriorityOtherFactors {
  sla_proximity: number;
  reporter_reliability: number;
}

export interface PriorityScoreResult {
  inputs: ReturnType<typeof priorityInputs>;
  total_score: number;
  breakdown: PriorityBreakdown;
  other_factors: PriorityOtherFactors;
  override_score?: number;
  config_version: number;
  computed_at?: Date;
}

export function priorityInputs(report: {
  severity: number | null;
  population_affected: number | null;
  vulnerability_index: number | null;
  reported_severity?: string | null;
}) {
  const labelScores: Record<string, number> = {
    ringan: 25,
    sedang: 50,
    berat: 75,
    kritis: 100,
  };
  const reportedScore = labelScores[report.reported_severity ?? ""] ?? null;
  return {
    severity: {
      value: report.severity ?? reportedScore,
      source:
        report.severity != null
          ? "assessment"
          : reportedScore != null
            ? "reported_severity_rule"
            : "missing",
    },
    population_affected: {
      value: report.population_affected,
      source: report.population_affected == null ? "missing" : "reported",
    },
    vulnerability_index: {
      value: report.vulnerability_index,
      source: report.vulnerability_index == null ? "missing" : "reported",
    },
    missing_input_policy: "zero_weighted_contribution_not_measured_zero",
  };
}

function computeSlaPressure(deadline: Date | null): number {
  if (!deadline) return 0;
  const now = Date.now();
  const deadlineMs = deadline.getTime();
  const hoursRemaining = (deadlineMs - now) / 3_600_000;
  if (hoursRemaining < 0) return 1;
  if (hoursRemaining >= 72) return 0;
  return Math.round((1 - hoursRemaining / 72) * 100) / 100;
}

async function getActiveFormulaVersion(env: Env): Promise<{
  version: number;
  weights: {
    severity: number;
    impact: number;
    vulnerability?: number;
    report_count?: number;
    sla: number;
  };
} | null> {
  const result = await env.D1.prepare(
    `SELECT version, weights FROM priority_formula_versions WHERE is_active = 1 LIMIT 1`,
  ).first<{
    version: number;
    weights: string;
  }>();
  if (!result) {
    return null;
  }
  if (!result.weights) {
    return null;
  }
  return {
    version: Number(result.version),
    weights: JSON.parse(result.weights) as {
      severity: number;
      impact: number;
      vulnerability?: number;
      report_count?: number;
      sla: number;
    },
  };
}

async function computeReporterReliability(
  env: Env,
  deviceId: string | null,
): Promise<number> {
  if (!deviceId) return 0.5;
  const result = await env.D1.prepare(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN status IN ('verified', 'resolved') THEN 1 END) as completed
     FROM reports WHERE device_id = ?`,
  )
    .bind(deviceId)
    .first<{
      total: number;
      completed: number;
    }>();
  const total = result?.total ?? 0;
  const completed = result?.completed ?? 0;
  if (total === 0) return 0.5;
  return Math.round((completed / total) * 100) / 100;
}

function priorityToPrioritas(priority: number | null): string {
  if (priority === null) return "sedang"; // default to medium
  if (priority <= 1) return "rendah";
  if (priority === 2) return "sedang";
  if (priority === 3) return "tinggi";
  return "kritis"; // priority >= 4
}

function severityToPrioritas(severity: number | null): string {
  if (severity === null) return "sedang";
  if (severity <= 25) return "rendah";
  if (severity <= 50) return "sedang";
  if (severity <= 75) return "tinggi";
  return "kritis";
}

async function getSlaDeadline(
  env: Env,
  categoryId: string,
  priority: number | null,
): Promise<Date | null> {
  const prioritas = priorityToPrioritas(priority);
  const result = await env.D1.prepare(
    `SELECT jam FROM sla_rules WHERE kategori_id = ? AND prioritas = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(categoryId, prioritas)
    .first<{ jam: number }>();
  if (!result) {
    return null;
  }
  const slaHours = Number(result.jam);
  if (isNaN(slaHours)) {
    return null;
  }
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + slaHours);
  return deadline;
}

export async function getSlaDeadlineFromSeverity(
  env: Env,
  categoryId: string,
  severity: number | null,
  defaultHours = 168,
): Promise<Date | null> {
  const prioritas = severityToPrioritas(severity);
  const result = await env.D1.prepare(
    `SELECT jam FROM sla_rules WHERE kategori_id = ? AND prioritas = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(categoryId, prioritas)
    .first<{ jam: number }>();
  if (!result) {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + defaultHours);
    return deadline;
  }
  const slaHours = Number(result.jam);
  if (isNaN(slaHours) || slaHours <= 0) {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + defaultHours);
    return deadline;
  }
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + slaHours);
  return deadline;
}

export async function evaluatePriority(
  env: Env,
  reportId: string,
): Promise<PriorityScoreResult | null> {
  const formula = await getActiveFormulaVersion(env);
  if (!formula) {
    return null;
  }

  const reportResult = await env.D1.prepare(
    `SELECT severity, population_affected, vulnerability_index, deadline, device_id, category_id, priority, json_extract(impact,'$.reported_severity') AS reported_severity
     FROM reports WHERE id = ?`,
  )
    .bind(reportId)
    .first<{
      severity: number | null;
      population_affected: number | null;
      vulnerability_index: number | null;
      deadline: string | null;
      device_id: string | null;
      category_id: string;
      priority: number | null;
      reported_severity: string | null;
    }>();
  const report = reportResult;
  if (!report) {
    return null;
  }

  const {
    severity: severityW,
    impact: impactW,
    vulnerability: vulnerabilityW = 0,
    sla: slaW,
  } = formula.weights;

  const inputs = priorityInputs(report);
  const severityRaw = inputs.severity.value ?? 0;
  const severityN = Math.min(1, Math.max(0, severityRaw / 100));

  const impactN = Math.min(
    1,
    Math.max(0, (Number(report.population_affected) || 0) / 100_000),
  );

  const vulnerabilityN = Math.min(
    1,
    Math.max(0, Number(report.vulnerability_index) || 0),
  );

  let deadline = report.deadline ? new Date(report.deadline) : null;
  if (!deadline) {
    deadline = await getSlaDeadline(env, report.category_id, report.priority);
  }
  const slaN = computeSlaPressure(deadline);

  const weighted =
    severityN * severityW +
    impactN * impactW +
    vulnerabilityN * vulnerabilityW +
    slaN * slaW;
  const base = Math.round(weighted * 100);

  const corroborationsR = await env.D1.prepare(
    `SELECT COUNT(DISTINCT reporter_id) AS cnt FROM reports WHERE merged_into = ? AND contribution_type = 'corroboration' AND reporter_id IS NOT NULL AND reporter_id != (SELECT reporter_id FROM reports WHERE id = ?)`,
  )
    .bind(reportId, reportId)
    .first<{ cnt: number }>();
  const corroborations = corroborationsR?.cnt ?? 0;
  const bonus = Math.min(
    corroborations * REPORT_COUNT_CONTRIBUTION_FACTOR,
    REPORT_COUNT_MAX_CONTRIBUTION,
  );

  const totalScore = Math.min(100, base + bonus);

  const severityComponent = Math.round(severityN * severityW * 100);
  const impactComponent = Math.round(impactN * impactW * 100);
  const vulnerabilityComponent = Math.round(vulnerabilityN * vulnerabilityW * 100);
  const slaComponent = Math.round(slaN * slaW * 100);
  const slaProximity = slaN;
  const reporterReliability = await computeReporterReliability(
    env,
    report.device_id,
  );

  const breakdown: PriorityBreakdown = {
    severity: severityComponent,
    impact: impactComponent,
    vulnerability: vulnerabilityComponent,
    sla: slaComponent,
    report_count: bonus,
  };

  const otherFactors: PriorityOtherFactors = {
    sla_proximity: Math.round(slaProximity * 100) / 100,
    reporter_reliability: reporterReliability,
  };

  const now = new Date().toISOString();

  await env.D1.prepare(
    `INSERT INTO priority_scores (
      report_id, computed_score, severity_component, population_component,
      vulnerability_component, sla_component, report_count_component,
      config_version, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET
      computed_score = excluded.computed_score,
      severity_component = excluded.severity_component,
      population_component = excluded.population_component,
      vulnerability_component = excluded.vulnerability_component,
      sla_component = excluded.sla_component,
      report_count_component = excluded.report_count_component,
      config_version = excluded.config_version,
      computed_at = excluded.computed_at`,
  )
    .bind(
      reportId,
      totalScore,
      severityComponent,
      impactComponent,
      vulnerabilityComponent,
      slaComponent,
      bonus,
      formula.version,
      now,
    )
    .run();

  return {
    inputs,
    total_score: totalScore,
    breakdown,
    other_factors: otherFactors,
    config_version: formula.version,
    computed_at: new Date(),
  };
}

export async function getPriorityScore(
  env: Env,
  reportId: string,
): Promise<PriorityScoreResult | null> {
  const result = await env.D1.prepare(
    `SELECT ps.computed_score, ps.severity_component, ps.population_component AS impact_component,
            ps.vulnerability_component, ps.sla_component, ps.report_count_component,
            ps.override_score, ps.config_version, ps.computed_at,
            r.device_id, r.deadline, r.severity, r.population_affected, r.vulnerability_index, json_extract(r.impact,'$.reported_severity') AS reported_severity
     FROM priority_scores ps
     JOIN reports r ON r.id = ps.report_id
     WHERE ps.report_id = ?`,
  )
    .bind(reportId)
    .first<{
      computed_score: number;
      severity_component: number | null;
      impact_component: number | null;
      vulnerability_component: number | null;
      sla_component: number | null;
      report_count_component: number | null;
      override_score: number | null;
      config_version: number | null;
      computed_at: string | null;
      device_id: string | null;
      deadline: string | null;
      severity: number | null;
      population_affected: number | null;
      vulnerability_index: number | null;
      reported_severity: string | null;
    }>();
  if (!result) {
    return null;
  }
  const row = result;

  const deadline = row.deadline ? new Date(row.deadline) : null;
  const slaProximity = computeSlaPressure(deadline);
  const reporterReliability = await computeReporterReliability(
    env,
    row.device_id,
  );

  return {
    inputs: priorityInputs(row),
    total_score: row.override_score ?? row.computed_score,
    breakdown: {
      severity: row.severity_component ?? 0,
      impact: row.impact_component ?? 0,
      vulnerability: row.vulnerability_component ?? 0,
      sla: row.sla_component ?? 0,
      report_count: row.report_count_component ?? 0,
    },
    other_factors: {
      sla_proximity: Math.round(slaProximity * 100) / 100,
      reporter_reliability: reporterReliability,
    },
    config_version: row.config_version ?? 1,
    computed_at: row.computed_at ? new Date(row.computed_at) : new Date(),
    ...(row.override_score != null && {
      override_score: row.override_score as number,
    }),
  };
}

export function computePriorityBreakdown(input: {
  severity: number;
  population?: number;
  vulnerability?: number;
  sla?: number;
  report_count?: number;
}): PriorityBreakdown {
  return {
    severity: input.severity ?? 0,
    impact: input.population ?? 0,
    vulnerability: input.vulnerability ?? 0,
    sla: input.sla ?? 0,
    report_count: input.report_count ?? 0,
  };
}

export function computePriority(input: {
  severity: number;
  population?: number;
  vulnerability?: number;
  sla?: number;
  report_count?: number;
}): number {
  const b = computePriorityBreakdown(input);
  const severityN = Math.min(1, Math.max(0, b.severity / 100));
  const impactN = Math.min(1, Math.max(0, b.impact / 100_000));
  const vulnerabilityN = Math.min(1, Math.max(0, b.vulnerability));
  const slaN = Math.min(1, Math.max(0, b.sla));
  const weighted =
    severityN * 0.35 + impactN * 0.25 + vulnerabilityN * 0.2 + slaN * 0.2;
  const base = Math.round(weighted * 100);
  const bonus = Math.min(b.report_count ?? 0, REPORT_COUNT_MAX_CONTRIBUTION);
  return Math.min(100, base + bonus);
}
