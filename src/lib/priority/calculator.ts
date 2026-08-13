import type { Env } from "@/types/bindings";
import { withClient, type PgClient } from "@/lib/db";

export interface PriorityBreakdown {
  severity: number;
  impact: number;
  vulnerability: number;
  sla: number;
}

export interface PriorityOtherFactors {
  sla_proximity: number;
  reporter_reliability: number;
}

export interface PriorityScoreResult {
  total_score: number;
  breakdown: PriorityBreakdown;
  other_factors: PriorityOtherFactors;
  override_score?: number;
  config_version: number;
  computed_at?: Date;
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

async function getActiveFormulaVersion(env: Env, client: PgClient): Promise<{
  version: number;
  weights: { severity: number; impact: number; vulnerability: number; sla: number };
} | null> {
  const result = await client.query(
    `SELECT version, weights FROM priority_formula_versions WHERE is_active = true LIMIT 1`
  );
  if (!result.rows[0]) {
    return null;
  }
  return {
    version: Number(result.rows[0].version),
    weights: result.rows[0].weights as { severity: number; impact: number; vulnerability: number; sla: number },
  };
}

async function computeReporterReliability(env: Env, client: PgClient, deviceId: string | null): Promise<number> {
  if (!deviceId) return 0.5;
  const result = await client.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status IN ('verified', 'resolved')) as completed
     FROM reports WHERE device_id = $1`,
    [deviceId]
  );
  const total = parseInt(result.rows[0].total, 10);
  const completed = parseInt(result.rows[0].completed, 10);
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

async function getSlaDeadline(
  env: Env,
  client: PgClient,
  categoryId: string,
  priority: number | null
): Promise<Date | null> {
  const prioritas = priorityToPrioritas(priority);
  const result = await client.query(
    `SELECT jam FROM sla_rules WHERE kategori_id = $1 AND prioritas = $2 AND is_active = true LIMIT 1`,
    [categoryId, prioritas]
  );
  if (!result.rows[0]) {
    return null;
  }
  const slaHours = Number(result.rows[0].jam);
  if (isNaN(slaHours)) {
    return null;
  }
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + slaHours);
  return deadline;
}

export async function evaluatePriority(
  env: Env,
  reportId: string
): Promise<PriorityScoreResult | null> {
  return await withClient(env, async (client: PgClient) => {
    const formula = await getActiveFormulaVersion(env, client);
    if (!formula) {
      return null;
    }

    const reportResult = await client.query(
      `SELECT severity, population_affected, vulnerability_index, deadline, device_id, category_id, priority
       FROM reports WHERE id = $1`,
      [reportId]
    );
    const report = reportResult.rows[0];
    if (!report) {
      return null;
    }

    const { severity: severityW, impact: impactW, vulnerability: vulnerabilityW, sla: slaW } = formula.weights;

    const severityRaw = Number(report.severity) || 1;
    const severityNormalized = Math.min(1, Math.max(0, (severityRaw - 1) / 4));
    const severityComponent = Math.round(severityNormalized * 100);

    const impactNormalized = Math.min(1, Math.max(0, (Number(report.population_affected) || 0) / 100_000));
    const impactComponent = Math.round(impactNormalized * 100);

    const vulnerabilityNormalized = Math.min(1, Math.max(0, Number(report.vulnerability_index) || 0));
    const vulnerabilityComponent = Math.round(vulnerabilityNormalized * 100);

    let deadline = report.deadline ? new Date(report.deadline) : null;
    if (!deadline) {
      deadline = await getSlaDeadline(env, client, report.category_id, report.priority);
    }
    const slaNormalized = computeSlaPressure(deadline);
    const slaComponent = Math.round(slaNormalized * 100);

    const slaProximity = slaNormalized;
    const reporterReliability = await computeReporterReliability(env, client, report.device_id);

    const totalScore = Math.round(
      (severityNormalized * severityW * 100) +
      (impactNormalized * impactW * 100) +
      (vulnerabilityNormalized * vulnerabilityW * 100) +
      (slaNormalized * slaW * 100)
    );

    const breakdown: PriorityBreakdown = {
      severity: severityComponent,
      impact: impactComponent,
      vulnerability: vulnerabilityComponent,
      sla: slaComponent,
    };

    const otherFactors: PriorityOtherFactors = {
      sla_proximity: Math.round(slaProximity * 100) / 100,
      reporter_reliability: reporterReliability,
    };

    await client.query(
      `INSERT INTO priority_scores (report_id, computed_score, severity_component, population_component, vulnerability_component, sla_component, config_version, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (report_id) DO UPDATE SET
         computed_score = EXCLUDED.computed_score,
         severity_component = EXCLUDED.severity_component,
         population_component = EXCLUDED.population_component,
         vulnerability_component = EXCLUDED.vulnerability_component,
         sla_component = EXCLUDED.sla_component,
         config_version = EXCLUDED.config_version,
         computed_at = NOW()`,
      [reportId, totalScore, severityComponent, impactComponent, vulnerabilityComponent, slaComponent, formula.version]
    );

    return {
      total_score: totalScore,
      breakdown,
      other_factors: otherFactors,
      config_version: formula.version,
      computed_at: new Date(),
    };
  });
}

export async function getPriorityScore(env: Env, reportId: string): Promise<PriorityScoreResult | null> {
  return await withClient(env, async (client: PgClient) => {
    const result = await client.query(
      `SELECT ps.computed_score, ps.severity_component, ps.population_component,
              ps.vulnerability_component, ps.sla_component,
              ps.override_score, ps.config_version, ps.computed_at,
              r.population_affected, r.device_id, r.deadline
       FROM priority_scores ps
       JOIN reports r ON r.id = ps.report_id
       WHERE ps.report_id = $1`,
      [reportId]
    );
    if (!result.rows[0]) {
      return null;
    }
    const row = result.rows[0];

    const deadline = row.deadline ? new Date(row.deadline) : null;
    const slaProximity = computeSlaPressure(deadline);
    const reporterReliability = await computeReporterReliability(env, client, row.device_id);

    return {
      total_score: row.override_score ?? row.computed_score,
      breakdown: {
        severity: row.severity_component ?? 0,
        impact: row.population_component ?? 0,
        vulnerability: row.vulnerability_component ?? 0,
        sla: row.sla_component ?? 0,
      },
      other_factors: {
        sla_proximity: Math.round(slaProximity * 100) / 100,
        reporter_reliability: reporterReliability,
      },
      override_score: row.override_score ?? undefined,
      config_version: row.config_version ?? 1,
      computed_at: row.computed_at,
    };
  });
}
