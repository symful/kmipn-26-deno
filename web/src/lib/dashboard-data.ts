import { parseServerTimestamp } from "./server-time";
/**
 * Shared dashboard data module for admin dashboards.
 * Provides real-time data fetching and transformation utilities.
 */

import { api } from "../api/client";
import type { DashboardStats, Report } from "../types";
import { logger } from "./logger";

export { api };

// ─── Status constants ────────────────────────────────────────────────────────

/** Non-terminal report statuses (active cases still in workflow) */
export const NON_TERMINAL_STATUSES = [
  "submitted",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
  "needs_survey",
] as const;

/** Terminal statuses (cases no longer in active workflow) */
export const TERMINAL_STATUSES = [
  "resolved",
  "closed",
  "rejected",
  "duplicate_merged",
] as const;

// ─── SLA helpers ─────────────────────────────────────────────────────────────

const SLA_DEFAULT_DAYS = 7;

/** Returns hours until deadline (negative = overdue). Returns null if no deadline. */
export function getDeadlineDeltaHours(
  deadline: string | null | undefined,
): number | null {
  if (!deadline) return null;
  const dl = new Date(deadline).getTime();
  const now = Date.now();
  return Math.round((dl - now) / (1000 * 60 * 60));
}

/** Returns hours since report was created (used as SLA proxy when no deadline set). */
export function getCreatedAtDeltaHours(createdAt: string): number {
  const created = parseServerTimestamp(createdAt).getTime();
  return Math.round((Date.now() - created) / (1000 * 60 * 60));
}

/** SLA urgency level for display badge */
export type SlaUrgency = "breached" | "warning" | "ok";

/**
 * Returns SLA urgency for a report.
 * Uses explicit deadline if set; otherwise falls back to created_at + SLA_DEFAULT_DAYS.
 */
export function getSlaUrgency(report: Report): {
  urgency: SlaUrgency;
  deltaHours: number;
  label: string;
} {
  const dlHours = getDeadlineDeltaHours(report.deadline);

  let deltaHours: number;
  if (dlHours !== null) {
    deltaHours = dlHours;
  } else {
    // Fallback: treat created_at as start of SLA window
    deltaHours =
      SLA_DEFAULT_DAYS * 24 - getCreatedAtDeltaHours(report.created_at);
  }

  if (deltaHours < 0) {
    return { urgency: "breached", deltaHours, label: `SLA ${deltaHours}h` };
  } else if (deltaHours < 24) {
    return {
      urgency: "warning",
      deltaHours,
      label: `SLA ${Math.round(deltaHours)}j`,
    };
  } else {
    return {
      urgency: "ok",
      deltaHours,
      label: `SLA ${Math.round(deltaHours / 24)}d`,
    };
  }
}

/** Sort comparator: breached first (most negative delta), then warning, then ok.
 *  Within same urgency, sort by severity desc.
 */
export function compareCritical(a: Report, b: Report): number {
  const urgencyOrder = { breached: 0, warning: 1, ok: 2 } as const;
  const aU = getSlaUrgency(a);
  const bU = getSlaUrgency(b);
  const urgencyDiff = urgencyOrder[aU.urgency] - urgencyOrder[bU.urgency];
  if (urgencyDiff !== 0) return urgencyDiff;
  return (b.severity ?? 0) - (a.severity ?? 0);
}

// ─── Critical cases ──────────────────────────────────────────────────────────

export interface CriticalCase {
  id: string;
  title: string;
  caseCode: string;
  village: string;
  status: string;
  severity: number | null;
  deadline: string | null | undefined;
  slaLabel: string;
  slaUrgency: SlaUrgency;
  createdAt: string;
}

export function generateCaseCode(report: Report): string {
  // Derive a 2-letter code from category name (first letters of words)
  const catName = report.category?.name ?? report.category_id ?? "CS";
  const shortCode = catName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hexDigits = report.id.replace(/-/g, "").slice(-8);
  const numericValue = parseInt(hexDigits, 16) % 10000;
  return `${shortCode}-${numericValue.toString().padStart(4, "0")}`;
}

/** Fetches all reports and returns top 4 critical non-terminal cases. */
export async function fetchCriticalCases(): Promise<CriticalCase[]> {
  try {
    const data = await api.reports({ page: 1, limit: 100 });
    const reports: Report[] = data.data ?? [];

    const critical = reports
      .filter((r) =>
        NON_TERMINAL_STATUSES.includes(
          r.status as (typeof NON_TERMINAL_STATUSES)[number],
        ),
      )
      .sort(compareCritical)
      .slice(0, 4);

    return critical.map((r): CriticalCase => {
      const sla = getSlaUrgency(r);
      return {
        id: r.id,
        title: r.title ?? r.description.slice(0, 50),
        caseCode: generateCaseCode(r),
        village: r.village_name ?? "Unknown",
        status: r.status,
        severity: r.severity,
        deadline: r.deadline,
        slaLabel: sla.label,
        slaUrgency: sla.urgency,
        createdAt: r.created_at,
      };
    });
  } catch (e) {
    logger.error("Failed to fetch critical cases", { error: e });
    return [];
  }
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export interface DashboardStatCards {
  totalCases: number;
  newCases: number; // submitted
  pendingVerification: number; // under_review
  slaBreached: number;
  inProgress: number; // verified + assigned + in_progress
  needsCompletion: number; // needs_completion (from by_status)
}

export function computeStatCards(
  stats: DashboardStats | null,
): DashboardStatCards {
  const by = stats?.by_status ?? {};
  return {
    totalCases: stats?.total ?? 0,
    newCases: by.submitted ?? 0,
    pendingVerification: by.under_review ?? 0,
    slaBreached: stats?.sla_breached ?? 0,
    inProgress: (by.verified ?? 0) + (by.assigned ?? 0) + (by.in_progress ?? 0),
    needsCompletion: by.needs_completion ?? 0,
  };
}

/** Wraps api.reportsStats() for shared consumption */
export async function fetchDashboardStats(): Promise<DashboardStats | null> {
  try {
    return await api.reportsStats();
  } catch (e) {
    logger.error("Failed to fetch dashboard stats", { error: e });
    return null;
  }
}

// ─── Scope header ────────────────────────────────────────────────────────────

export interface ScopeHeader {
  periodLabel: string;
  nowWIB: string;
  villageCount: number;
}

/** Returns Indonesian-formatted current timestamp in WIB (UTC+7) */
export function formatWIB(date: Date): string {
  return (
    date
      .toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "") + " WIB"
  );
}

/** Returns month-year label for scope dropdown e.g. "Jul 2026" */
export function formatPeriodLabel(date: Date): string {
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "short",
    year: "numeric",
  });
}

export function computeScopeHeader(stats: DashboardStats | null): ScopeHeader {
  const now = new Date();
  return {
    periodLabel: formatPeriodLabel(now),
    nowWIB: formatWIB(now),
    villageCount: 0,
  };
}

// ─── Backlog day-bucketing (client-side) ─────────────────────────────────────

export interface BacklogBucket {
  day: string; // YYYY-MM-DD
  laporan_count: number;
  kasus_count: number;
}

/** Client-side day-bucket the last `days` from raw reports list */
export function computeBacklogFromReports(
  reports: Report[],
  days = 30,
): BacklogBucket[] {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  // Build a map of day -> { laporan, kasus }
  const buckets = new Map<string, { laporan: number; kasus: Set<string> }>();

  for (const r of reports) {
    const created = parseServerTimestamp(r.created_at).getTime();
    if (created < cutoff) continue;
    const day = r.created_at.slice(0, 10); // YYYY-MM-DD
    if (!buckets.has(day)) {
      buckets.set(day, { laporan: 0, kasus: new Set() });
    }
    const b = buckets.get(day)!;
    b.laporan++;
    if (
      !TERMINAL_STATUSES.includes(
        r.status as (typeof TERMINAL_STATUSES)[number],
      )
    ) {
      b.kasus.add(r.id);
    }
  }

  // Fill in missing days
  const result: BacklogBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const dayStr = d.toISOString().slice(0, 10);
    const b = buckets.get(dayStr);
    result.push({
      day: dayStr,
      laporan_count: b?.laporan ?? 0,
      kasus_count: b?.kasus?.size ?? 0,
    });
  }
  return result;
}
