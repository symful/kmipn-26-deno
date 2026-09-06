import { getSyncStatus } from "@/lib/sync-status";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { integrationStatus } from "@/lib/integrations";

export const syncQualityRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

syncQualityRoute.get(
  "/",
  safeHandler(async (c) => {
    const offlineOriginatedR = await c.env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports WHERE local_id IS NOT NULL OR device_id IS NOT NULL`,
    ).first<{ count: number }>();
    const offline_originated = offlineOriginatedR?.count ?? 0;

    const totalR = await c.env.D1.prepare(
      `SELECT COUNT(*) AS count FROM reports`,
    ).first<{ count: number }>();
    const total = totalR?.count ?? 0;

    const latencyR = await c.env.D1.prepare(
      `SELECT
        AVG(julianday(created_at) - julianday(reported_at)) * 86400 AS avg_latency,
        MAX(julianday(created_at) - julianday(reported_at)) * 86400 AS max_latency
       FROM reports
       WHERE reported_at IS NOT NULL AND local_id IS NOT NULL`,
    ).first<{ avg_latency: number | null; max_latency: number | null }>();

    const avg_sync_latency_seconds =
      latencyR?.avg_latency != null
        ? Math.round(latencyR.avg_latency * 100) / 100
        : null;
    const max_sync_latency_seconds =
      latencyR?.max_latency != null
        ? Math.round(latencyR.max_latency * 100) / 100
        : null;

    return c.json({
      offline_originated,
      total,
      ...(await getSyncStatus(c.env)),
      avg_sync_latency_seconds,
      max_sync_latency_seconds,
      connectors: integrationStatus(c.env),
    });
  }),
);
