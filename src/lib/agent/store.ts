import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";
import { logger } from "@/lib/logger";

export interface AssessmentFactors {
  supporting_factors: string[];
  risk_factors: string[];
  correlation_ids: string[];
}

export interface AssessmentInput {
  tool_name: string;
  report_id: string;
  model_version: string;
  rule_version: string;
  confidence: number;
  supporting_factors: string[];
  risk_factors: string[];
  correlation_ids: string[];
  idempotency_key: string;
  status: string;
  result: Record<string, unknown>;
}

export async function saveAssessment(env: Env, input: AssessmentInput): Promise<string> {
  try {
    return await withClient(env, async (c) => {
      const result = await c.query<{ id: string }>(
        `INSERT INTO agent_assessments (
          report_id, assessment_kind, model_version, rule_version, confidence,
          supporting_factors, risk_factors, correlation_ids,
          idempotency_key, assessment_status, result, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
        ON CONFLICT (report_id, assessment_kind) DO UPDATE SET
          model_version = EXCLUDED.model_version,
          rule_version = EXCLUDED.rule_version,
          confidence = EXCLUDED.confidence,
          supporting_factors = EXCLUDED.supporting_factors,
          risk_factors = EXCLUDED.risk_factors,
          correlation_ids = EXCLUDED.correlation_ids,
          idempotency_key = EXCLUDED.idempotency_key,
          assessment_status = EXCLUDED.assessment_status,
          result = EXCLUDED.result,
          created_at = NOW()
        RETURNING id`,
        [
          input.report_id,
          input.tool_name,
          input.model_version,
          input.rule_version,
          input.confidence,
          input.supporting_factors,
          input.risk_factors,
          input.correlation_ids,
          input.idempotency_key,
          input.status,
          JSON.stringify(input.result),
        ]
      );
      if (!result.rows[0]) {
        throw new Error("Failed to insert assessment: no returned id");
      }
      return result.rows[0].id;
    });
  } catch (e) {
    logger.error({
      route: "/internal/agent/assessment",
      method: "SAVE",
      context: "assessment_save_failed",
      tool: input.tool_name,
      report_id: input.report_id,
      error: e instanceof Error ? e : new Error(String(e)),
    });
    throw e;
  }
}

export interface AssessmentResponse {
  id: string;
  tool_name: string;
  agent_version: string;
  rule_version: string;
  confidence: number;
  factors: {
    supporting: string[];
    risk: string[];
    correlation_ids: string[];
  };
  status: string;
  result: Record<string, unknown>;
  created_at: string;
}

export async function getAssessments(
  env: Env,
  reportId: string,
  modelVersion?: string
): Promise<AssessmentResponse[]> {
  return await withClient(env, async (c) => {
    let query = `SELECT id, assessment_kind, COALESCE(agent_version, model_version) as agent_version,
                        rule_version, confidence,
                        supporting_factors, risk_factors, correlation_ids,
                        assessment_status, result, created_at
                 FROM agent_assessments
                 WHERE report_id = $1`;
    const params: (string | undefined)[] = [reportId];

    if (modelVersion) {
      query += ` AND COALESCE(agent_version, model_version) = $2`;
      params.push(modelVersion);
    }

    query += ` ORDER BY created_at ASC`;

    const result = await c.query(query, params);
    return result.rows.map((r) => ({
      id: r.id as string,
      tool_name: r.assessment_kind as string,
      agent_version: (r.agent_version || '') as string,
      rule_version: (r.rule_version || '') as string,
      confidence: Number(r.confidence),
      factors: {
        supporting: (r.supporting_factors || []) as string[],
        risk: (r.risk_factors || []) as string[],
        correlation_ids: (r.correlation_ids || []) as string[],
      },
      status: r.assessment_status as string,
      result: (r.result || {}) as Record<string, unknown>,
      created_at: new Date(r.created_at as string).toISOString(),
    }));
  });
}

export async function getAllAssessments(
  env: Env,
  reportId?: string,
  modelVersion?: string
): Promise<AssessmentResponse[]> {
  return await withClient(env, async (c) => {
    const conditions: string[] = [];
    const params: (string | undefined)[] = [];
    let paramIndex = 1;

    if (reportId) {
      conditions.push(`report_id = $${paramIndex++}`);
      params.push(reportId);
    }

    if (modelVersion) {
      conditions.push(`COALESCE(agent_version, model_version) = $${paramIndex++}`);
      params.push(modelVersion);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await c.query(
      `SELECT id, assessment_kind, COALESCE(agent_version, model_version) as agent_version,
              rule_version, confidence,
              supporting_factors, risk_factors, correlation_ids,
              assessment_status, result, created_at
       FROM agent_assessments
       ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    return result.rows.map((r) => ({
      id: r.id as string,
      tool_name: r.assessment_kind as string,
      agent_version: (r.agent_version || '') as string,
      rule_version: (r.rule_version || '') as string,
      confidence: Number(r.confidence),
      factors: {
        supporting: (r.supporting_factors || []) as string[],
        risk: (r.risk_factors || []) as string[],
        correlation_ids: (r.correlation_ids || []) as string[],
      },
      status: r.assessment_status as string,
      result: (r.result || {}) as Record<string, unknown>,
      created_at: new Date(r.created_at as string).toISOString(),
    }));
  });
}

export async function getAssessmentTrace(
  env: Env,
  assessmentId: string
): Promise<{
  id: string;
  report_id: string;
  tool_name: string;
  agent_version: string;
  rule_version: string;
  confidence: number;
  factors: {
    supporting: string[];
    risk: string[];
    correlation_ids: string[];
  };
  idempotency_key: string | null;
  status: string;
  result: Record<string, unknown>;
  created_at: string;
} | null> {
  return await withClient(env, async (c) => {
    const result = await c.query(
      `SELECT id, report_id, assessment_kind, COALESCE(agent_version, model_version) as agent_version,
              rule_version, confidence,
              supporting_factors, risk_factors, correlation_ids,
              idempotency_key, assessment_status, result, created_at
       FROM agent_assessments
       WHERE id = $1`,
      [assessmentId]
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      id: r.id as string,
      report_id: r.report_id as string,
      tool_name: r.assessment_kind as string,
      agent_version: (r.agent_version || '') as string,
      rule_version: (r.rule_version || '') as string,
      confidence: Number(r.confidence),
      factors: {
        supporting: (r.supporting_factors || []) as string[],
        risk: (r.risk_factors || []) as string[],
        correlation_ids: (r.correlation_ids || []) as string[],
      },
      idempotency_key: r.idempotency_key as string | null,
      status: r.assessment_status as string,
      result: (r.result || {}) as Record<string, unknown>,
      created_at: new Date(r.created_at as string).toISOString(),
    };
  });
}

export function flattenAssessment<T extends Record<string, unknown>>(row: {
  assessment_kind: string;
  assessment_status: string;
  confidence: number;
  result: T;
  created_at: Date | string;
}): {
  kind: string;
  status: string;
  confidence: number;
  created_at: string;
} & T {
  const { assessment_kind, assessment_status, confidence, result, created_at } = row;
  return {
    kind: assessment_kind,
    status: assessment_status,
    confidence: Number(confidence),
    created_at: new Date(created_at).toISOString(),
    ...result,
  };
}
