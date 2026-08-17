import type { Env } from "@/types/bindings";
import { withClient } from "@/lib/db";

export interface PriorityConfig {
  version: number;
  severityWeight: number;
  affectedResidentsWeight: number;
  regionVulnerabilityWeight: number;
  slaPressureWeight: number;
}

export async function getPriorityConfig(env: Env): Promise<PriorityConfig | null> {
  return await withClient(env, async (client) => {
    const result = await client.query(
      `SELECT version, severity_weight, population_weight, vulnerability_weight, sla_pressure_weight
       FROM priority_config WHERE is_active = true LIMIT 1`
    );
    if (!result.rows[0]) {
      return null;
    }
    const row = result.rows[0];
    const config: PriorityConfig = {
      version: Number(row.version),
      severityWeight: Number(row.severity_weight),
      affectedResidentsWeight: Number(row.population_weight),
      regionVulnerabilityWeight: Number(row.vulnerability_weight),
      slaPressureWeight: Number(row.sla_pressure_weight),
    };
    return config;
  });
}
