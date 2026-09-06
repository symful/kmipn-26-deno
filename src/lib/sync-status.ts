import type { Env } from "@/types/bindings";

export async function getSyncStatus(env: Env) {
  const row = await env.D1.prepare(
    `SELECT COUNT(*) AS reporting_devices,
    COALESCE(SUM(total_count),0) AS tracked_reports,
    COALESCE(SUM(pending_count),0) AS pending_sync_count,
    COALESCE(SUM(failed_count),0) AS failed_sync_count,
    MAX(observed_at) AS last_observed_at
    FROM device_sync_status`,
  ).first<{
    reporting_devices: number;
    tracked_reports: number;
    pending_sync_count: number;
    failed_sync_count: number;
    last_observed_at: string | null;
  }>();
  const devices = Number(row?.reporting_devices ?? 0);
  const total = Number(row?.tracked_reports ?? 0);
  const pending = Number(row?.pending_sync_count ?? 0);
  return {
    reporting_devices: devices,
    tracked_reports: total,
    pending_sync_count: pending,
    failed_sync_count: Number(row?.failed_sync_count ?? 0),
    sync_percentage:
      devices === 0
        ? null
        : total === 0
          ? 100
          : Math.round(((total - pending) / total) * 100),
    last_observed_at: row?.last_observed_at ?? null,
    source: "latest_device_observations" as const,
  };
}
