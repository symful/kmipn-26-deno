import { useEffect, useState } from "react";
import type { RegionFilterValue, Unit, WilayahNode } from "../types";
import { api } from "../api/client";
import { logger } from "@/lib/logger";

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
          api.priorityConfig().catch((e) => { logger.error("Failed to fetch priority config", { error: e }); return null; }),
          api.categories().catch((e) => { logger.error("Failed to fetch categories", { error: e }); return null; }),
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
              (v: { is_active?: boolean; version?: number }) => v.is_active
            );
            if (activeVersion) {
              // Check for sla_days or sla_warning_days fields if extended
              if ("sla_days" in activeVersion && typeof activeVersion.sla_days === "number") {
                slaDays = activeVersion.sla_days;
              }
              if ("sla_warning_days" in activeVersion && typeof activeVersion.sla_warning_days === "number") {
                slaWarningDays = activeVersion.sla_warning_days;
              }
            }
          }
          // Handle single version response (GET /:version)
          else if ("version" in priorityData) {
            if ("sla_days" in priorityData && typeof priorityData.sla_days === "number") {
              slaDays = priorityData.sla_days;
            }
            if ("sla_warning_days" in priorityData && typeof priorityData.sla_warning_days === "number") {
              slaWarningDays = priorityData.sla_warning_days;
            }
          }
        }

        // Check categories for per-category SLA overrides
        // Categories could have sla_days or sla_warning_days fields
        if (categoriesData && "categories" in categoriesData) {
          // Use the first category's SLA values as defaults if present
          // (in case different categories have different SLAs)
          const firstCategory = categoriesData.categories[0];
          if (firstCategory) {
            if ("sla_days" in firstCategory && typeof firstCategory.sla_days === "number") {
              slaDays = firstCategory.sla_days;
            }
            if ("sla_warning_days" in firstCategory && typeof firstCategory.sla_warning_days === "number") {
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

export type PriorityBucket = "" | "rendah" | "sedang" | "tinggi" | "kritis";
export type SLABucket = "" | "mendekati" | "melanggar";

interface RegionFilterProps {
  value: RegionFilterValue;
  onChange: (value: RegionFilterValue) => void;
}

export const RegionFilter = ({ value, onChange }: RegionFilterProps) => {
  const [allWilayah, setAllWilayah] = useState<WilayahNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.wilayah()
      .then((data) => {
        setAllWilayah(data.wilayah ?? []);
      })
      .catch((e) => { logger.error("Failed to fetch wilayah", { error: e }); setAllWilayah([]); })
      .finally(() => setLoading(false));
  }, []);

  const provinces = allWilayah.filter((w) => w.level === "PROVINSI");
  const getChildren = (parentId: string) =>
    allWilayah.filter((w) => w.parent_id === parentId);

  const kabupatens = value.provinsi ? getChildren(value.provinsi) : [];
  const kecamatans = value.kabupaten ? getChildren(value.kabupaten) : [];
  const desas = value.kecamatan ? getChildren(value.kecamatan) : [];

  const handleChange = (key: keyof RegionFilterValue, val: string) => {
    const next: RegionFilterValue = {
      provinsi: key === "provinsi" ? val : val ? value.provinsi : "",
      kabupaten: key === "kabupaten" ? val : val ? value.kabupaten : "",
      kecamatan: key === "kecamatan" ? val : val ? value.kecamatan : "",
      desa: key === "desa" ? val : val ? value.desa : "",
    };
    if (key === "provinsi") {
      next.kabupaten = "";
      next.kecamatan = "";
      next.desa = "";
    } else if (key === "kabupaten") {
      next.kecamatan = "";
      next.desa = "";
    } else if (key === "kecamatan") {
      next.desa = "";
    }
    onChange(next);
  };

  if (loading) {
    return (
      <select className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-sigap-surface text-sigap-textMuted" disabled>
        <option value="">Memuat wilayah...</option>
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value.provinsi}
        onChange={(e) => handleChange("provinsi", e.target.value)}
        className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
      >
        <option value="">Semua Provinsi</option>
        {provinces.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {value.provinsi && (
        <select
          value={value.kabupaten}
          onChange={(e) => handleChange("kabupaten", e.target.value)}
          className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
        >
          <option value="">Semua Kabupaten</option>
          {kabupatens.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      )}

      {value.kabupaten && (
        <select
          value={value.kecamatan}
          onChange={(e) => handleChange("kecamatan", e.target.value)}
          className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
        >
          <option value="">Semua Kecamatan</option>
          {kecamatans.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      )}

      {value.kecamatan && (
        <select
          value={value.desa}
          onChange={(e) => handleChange("desa", e.target.value)}
          className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
        >
          <option value="">Semua Desa</option>
          {desas.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
    </div>
  );
};

export const PRIORITY_OPTIONS: { value: PriorityBucket; label: string }[] = [
  { value: "" as PriorityBucket, label: "Semua Prioritas" },
  { value: "rendah" as PriorityBucket, label: "Rendah" },
  { value: "sedang" as PriorityBucket, label: "Sedang" },
  { value: "tinggi" as PriorityBucket, label: "Tinggi" },
  { value: "kritis" as PriorityBucket, label: "Kritis" },
];

export const PRIORITY_BUCKETS: Record<string, [number, number]> = {
  rendah: [0, 25],
  sedang: [26, 50],
  tinggi: [51, 75],
  kritis: [76, 100],
};

export const severityToBucket = (severity: number | null): PriorityBucket => {
  if (severity == null) return "" as PriorityBucket;
  if (severity <= 25) return "rendah" as PriorityBucket;
  if (severity <= 50) return "sedang" as PriorityBucket;
  if (severity <= 75) return "tinggi" as PriorityBucket;
  return "kritis" as PriorityBucket;
};

export const bucketToSeverityRange = (
  bucket: PriorityBucket,
): [number, number] | null => {
  if (!bucket) return null;
  return PRIORITY_BUCKETS[bucket] ?? null;
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
  slaDays: number = DEFAULT_SLA_DAYS
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
  slaDays: number = DEFAULT_SLA_DAYS
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
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.units()
      .then((data) => {
        setUnits(data.units ?? []);
      })
      .catch((e) => { logger.error("Failed to fetch units", { error: e }); setUnits([]); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <select className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-sigap-surface text-sigap-textMuted" disabled>
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
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
};