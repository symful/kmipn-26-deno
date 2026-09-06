import { useEffect, useState } from "react";
import type { RegionFilterValue } from "../types";
import { api } from "../api/client";
import { logger } from "@/lib/logger";
import {
  PRIORITY_OPTIONS,
  PRIORITY_BUCKETS,
  severityToBucket,
  bucketToSeverityRange,
  type PriorityBucket,
} from "../lib/priority-buckets";

interface AdminDashboardUnit {
  id: string;
  nama: string;
  alamat: string | null;
  kontak: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Default SLA values (fallback if API doesn't return them)
export const DEFAULT_SLA_DAYS = 7;
export const DEFAULT_SLA_WARNING_DAYS = 5;

export interface SLAConfig {
  slaDays: number;
  slaWarningDays: number;
}

/**
 * Hook to fetch SLA configuration from API.
 * Fetches from priorityConfig (active version) and categories for per-category SLA.
 * Falls back to defaults if API doesn't return SLA values.
 */
export function useSLAConfig() {
  const [config, setConfig] = useState<SLAConfig>({
    slaDays: DEFAULT_SLA_DAYS,
    slaWarningDays: DEFAULT_SLA_WARNING_DAYS,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSLAConfig() {
      try {
        // Fetch priority config (active version) and categories in parallel
        const [priorityData, categoriesData] = await Promise.all([
          api.priorityConfig().catch((e) => {
            logger.error("Failed to fetch priority config", { error: e });
            return null;
          }),
          api.categories().catch((e) => {
            logger.error("Failed to fetch categories", { error: e });
            return null;
          }),
        ]);

        if (cancelled) return;

        let slaDays = DEFAULT_SLA_DAYS;
        let slaWarningDays = DEFAULT_SLA_WARNING_DAYS;

        // Extract SLA days from priority config if available
        // The priorityConfig API returns { data: [...], pagination: {...} } for GET /
        // or a single version for GET /:version
        if (priorityData) {
          // Handle paginated response (GET /)
          if ("data" in priorityData && Array.isArray(priorityData.data)) {
            const activeVersion = priorityData.data.find(
              (v: { is_active?: boolean; version?: number }) => v.is_active,
            );
            if (activeVersion) {
              // Check for sla_days or sla_warning_days fields if extended
              if (
                "sla_days" in activeVersion &&
                typeof activeVersion.sla_days === "number"
              ) {
                slaDays = activeVersion.sla_days;
              }
              if (
                "sla_warning_days" in activeVersion &&
                typeof activeVersion.sla_warning_days === "number"
              ) {
                slaWarningDays = activeVersion.sla_warning_days;
              }
            }
          }
          // Handle single version response (GET /:version)
          else if ("version" in priorityData) {
            if (
              "sla_days" in priorityData &&
              typeof priorityData.sla_days === "number"
            ) {
              slaDays = priorityData.sla_days;
            }
            if (
              "sla_warning_days" in priorityData &&
              typeof priorityData.sla_warning_days === "number"
            ) {
              slaWarningDays = priorityData.sla_warning_days;
            }
          }
        }

        // Check categories for per-category SLA overrides
        // Categories could have sla_days or sla_warning_days fields
        if (categoriesData && "data" in categoriesData) {
          // Use the first category's SLA values as defaults if present
          // (in case different categories have different SLAs)
          const firstCategory = categoriesData.data[0];
          if (firstCategory) {
            if (
              "sla_days" in firstCategory &&
              typeof firstCategory.sla_days === "number"
            ) {
              slaDays = firstCategory.sla_days;
            }
            if (
              "sla_warning_days" in firstCategory &&
              typeof firstCategory.sla_warning_days === "number"
            ) {
              slaWarningDays = firstCategory.sla_warning_days;
            }
          }
        }

        setConfig({ slaDays, slaWarningDays });
      } catch (e) {
        logger.error("Failed to fetch SLA config", { error: e });
        // Use defaults on error
        if (!cancelled) {
          setConfig({
            slaDays: DEFAULT_SLA_DAYS,
            slaWarningDays: DEFAULT_SLA_WARNING_DAYS,
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSLAConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ...config, loading };
}

export type SLABucket = "" | "mendekati" | "melanggar";

interface RegionFilterProps {
  value: RegionFilterValue;
  onChange: (value: RegionFilterValue) => void;
}

export const RegionFilter = ({ value, onChange }: RegionFilterProps) => {
  return (
    <select
      value={value.kecamatan}
      onChange={(e) =>
        onChange({ ...value, kecamatan: e.target.value, desa: "" })
      }
      className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
    >
      <option value="">Semua Kecamatan</option>
    </select>
  );
};

interface PriorityFilterProps {
  value: PriorityBucket;
  onChange: (value: PriorityBucket) => void;
}

export const PriorityFilter = ({ value, onChange }: PriorityFilterProps) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PriorityBucket)}
      className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
    >
      {PRIORITY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const SLA_OPTIONS: { value: SLABucket; label: string }[] = [
  { value: "" as SLABucket, label: "Semua SLA" },
  { value: "mendekati" as SLABucket, label: "Mendekati SLA" },
  { value: "melanggar" as SLABucket, label: "Melanggar SLA" },
];

export const isSLAMelding = (
  createdAt: string,
  status: string,
  slaWarningDays: number = DEFAULT_SLA_WARNING_DAYS,
  slaDays: number = DEFAULT_SLA_DAYS,
): boolean => {
  if (status === "resolved" || status === "closed") return false;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  return ageDays >= slaWarningDays && ageDays < slaDays;
};

export const isSLABreaching = (
  createdAt: string,
  status: string,
  slaDays: number = DEFAULT_SLA_DAYS,
): boolean => {
  if (status === "resolved" || status === "closed") return false;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  return ageDays >= slaDays;
};

interface SLAFilterProps {
  value: SLABucket;
  onChange: (value: SLABucket) => void;
}

export const SLAFilter = ({ value, onChange }: SLAFilterProps) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SLABucket)}
      className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
    >
      {SLA_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

interface UnitFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export const UnitFilter = ({ value, onChange }: UnitFilterProps) => {
  const [units, setUnits] = useState<AdminDashboardUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .units()
      .then((data) => {
        setUnits(data.items ?? []);
      })
      .catch((e) => {
        logger.error("Failed to fetch units", { error: e });
        setUnits([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <select
        className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-sigap-surface text-sigap-textMuted"
        disabled
      >
        <option value="">Memuat unit...</option>
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
    >
      <option value="">Semua Unit</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nama}
        </option>
      ))}
    </select>
  );
};
