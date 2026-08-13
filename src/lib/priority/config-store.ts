import type { Env } from "@/types/bindings";
import { withClient } from "@/lib/db";

export interface PriorityConfig {
  version: number;
  severityWeight: number;
  affectedResidentsWeight: number;
  regionVulnerabilityWeight: number;
  slaPressureWeight: number;
}

interface CacheEntry {
  config: PriorityConfig;
  fetchedAt: number;
}

const TTL_MS = 60_000;

const cache = new Map<string, CacheEntry>();

export function invalidatePriorityConfigCache(): void {
  cache.clear();
}

export async function getPriorityConfig(env: Env): Promise<PriorityConfig | null> {
  const now = Date.now();
  const cached = cache.get("active");
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.config;
  }

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
    cache.set("active", { config, fetchedAt: now });
    return config;
  });
}
