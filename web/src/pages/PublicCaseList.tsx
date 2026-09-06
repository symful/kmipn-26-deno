import { parseServerTimestamp } from "../lib/server-time";
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { MapView } from "../components/MapView";

import type { GeoJSONFeatureCollection } from "../types";
import { colors, extendedColors, statusLabel } from "../theme/tokens";
import { logger } from "@/lib/logger";
import { SigapCard } from "@/components/design-system/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/design-system/EmptyState";
import { ErrorRetry } from "@/components/design-system/ErrorRetry";
import { PUBLIC_STATUS_OPTIONS } from "../lib/report-statuses";
import { PUBLIC_PRIORITY_OPTIONS } from "../lib/priority-buckets";

interface PublicReportItem {
  id: string;
  status: string;
  category_id: string;
  severity: number | null;
  created_at: string;
  lat: number;
  lng: number;
  description?: string;
  village_name?: string;
  report_count?: number;
}

export const PublicCaseList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<PublicReportItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const selectedCategory = searchParams.get("category") ?? "";
  const selectedStatus = searchParams.get("status") ?? "";
  const selectedPriority = searchParams.get("priority") ?? "";

  useEffect(() => {
    Promise.all([
      api.geojson(),
      api.publicCategories().then((data) => ({ data })),
    ])
      .then(([geojsonData, categoriesData]) => {
        const reportsFromGeoJSON: PublicReportItem[] = geojsonData.features.map(
          (f) => {
            const props = f.properties as Record<string, unknown>;
            const base = {
              id: f.properties.id,
              status: f.properties.status,
              category_id: f.properties.category_id,
              severity: f.properties.severity,
              created_at: f.properties.created_at,
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              description: f.properties.description,
            };
            if (props.village_name) {
              return { ...base, village_name: props.village_name as string };
            }
            if (props.report_count) {
              return { ...base, report_count: props.report_count as number };
            }
            return base;
          },
        );
        setReports(reportsFromGeoJSON);
        setCategories(categoriesData.data ?? []);
      })
      .catch((e: Error) => {
        logger.error("Failed to fetch case list", { error: e });
        setError(e.message || "Gagal memuat data");
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = reports.filter((report) => {
    if (selectedCategory && report.category_id !== selectedCategory)
      return false;
    if (selectedStatus && report.status !== selectedStatus) return false;
    if (selectedPriority) {
      if (report.severity == null) return false;
      if (selectedPriority === "high" && (report.severity ?? 0) < 0.7)
        return false;
      if (
        selectedPriority === "medium" &&
        ((report.severity ?? 0) < 0.4 || (report.severity ?? 0) >= 0.7)
      )
        return false;
      if (selectedPriority === "low" && (report.severity ?? 0) >= 0.4)
        return false;
    }
    return true;
  });

  const activeFilters: { key: string; label: string }[] = [];
  if (selectedStatus) {
    const s = PUBLIC_STATUS_OPTIONS.find((o) => o.value === selectedStatus);
    activeFilters.push({
      key: "status",
      label: s?.label ?? statusLabel(selectedStatus),
    });
  }
  if (selectedPriority) {
    const p = PUBLIC_PRIORITY_OPTIONS.find((o) => o.value === selectedPriority);
    activeFilters.push({
      key: "priority",
      label: p?.label ?? selectedPriority,
    });
  }

  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const removeFilter = (key: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete(key);
    setSearchParams(newParams);
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const getCategoryCode = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    const name = (cat?.name ?? categoryId).toLowerCase();
    if (name.includes("jalan")) return "JL";
    if (name.includes("jembatan")) return "JB";
    if (name.includes("air bersih")) return "AR";
    if (name.includes("fasilitas")) return "LP";
    if (name.includes("irigasi")) return "IR";
    const initials = (cat?.name ?? categoryId).slice(0, 2).toUpperCase();
    return initials;
  };

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.name ?? categoryId;
  };

  const getStatusStyle = (status: string) => {
    const opt = PUBLIC_STATUS_OPTIONS.find((o) => o.value === status);
    return opt?.color ?? "bg-gray-100 text-gray-700";
  };

  const getStatusLabel = (status: string) => {
    const opt = PUBLIC_STATUS_OPTIONS.find((o) => o.value === status);
    return opt?.label ?? statusLabel(status);
  };

  const getTimeAgo = (dateStr: string) => {
    const date = parseServerTimestamp(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Baru saja";
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays === 1) return "Kemarin";
    if (diffDays < 7) return `${diffDays} hari lalu`;
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  };

  const getStatusBadgeTone = (
    status: string,
  ): "success" | "warning" | "danger" | "info" | "neutral" => {
    if (
      status === "verified" ||
      status === "in_progress" ||
      status === "under_review"
    )
      return "info";
    if (status === "resolved") return "success";
    if (
      status === "submitted" ||
      status === "needs_survey" ||
      status === "rejected"
    )
      return "danger";
    return "neutral";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-100">
      <div
        className="border-b px-7 flex items-center gap-2.5 shrink-0"
        style={{
          height: 56,
          backgroundColor: colors.background,
          borderColor: colors.borderCard,
        }}
      >
        <select
          value={selectedCategory}
          onChange={(e) => handleFilterChange("category", e.target.value)}
          className="border rounded-lg px-3 py-2 text-[12.5px] focus:outline-none"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderCard,
            color: extendedColors.textSecondary,
          }}
        >
          <option value="">Semua Kategori</option>
          {Array.isArray(categories) &&
            categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
        </select>

        {activeFilters.map((filter) => (
          <div
            key={filter.key}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: colors.primaryLight,
              borderColor: extendedColors.successBorder,
              borderWidth: 1,
              color: colors.primaryDark,
            }}
          >
            {filter.label}
            <button
              onClick={() => removeFilter(filter.key)}
              className="hover:opacity-75 transition-opacity cursor-pointer"
              style={{ color: colors.primaryDark }}
            >
              ×
            </button>
          </div>
        ))}

        {(activeFilters?.length ?? 0) > 0 && (
          <button
            onClick={resetFilters}
            className="text-xs font-semibold hover:underline ml-1 cursor-pointer"
            style={{ color: colors.primary }}
          >
            Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span
            className="text-[12.5px]"
            style={{ color: colors.textTertiary }}
          >
            <span className="font-bold" style={{ color: colors.textPrimary }}>
              {filteredReports?.length ?? 0}
            </span>{" "}
            kasus
          </span>
          <div
            className="flex border rounded-lg overflow-hidden"
            style={{ borderColor: colors.borderCard }}
          >
            <button
              onClick={() => setViewMode("map")}
              aria-label="Tampilkan peta"
              className="px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
              style={
                viewMode === "map"
                  ? { backgroundColor: colors.primary, color: colors.surface }
                  : {
                      backgroundColor: colors.surface,
                      color: colors.textTertiary,
                    }
              }
            >
              Peta
            </button>
            <button
              onClick={() => setViewMode("list")}
              aria-label="Tampilkan daftar"
              className="px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
              style={
                viewMode === "list"
                  ? { backgroundColor: colors.primary, color: colors.surface }
                  : {
                      backgroundColor: colors.surface,
                      color: colors.textTertiary,
                    }
              }
            >
              Daftar
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden">
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50">
            <ErrorRetry
              error={error}
              onRetry={() => {
                setLoading(true);
                setError(null);
                Promise.all([
                  api.geojson(),
                  api.publicCategories().then((data) => ({ data })),
                ])
                  .then(([geojsonData, categoriesData]) => {
                    const reportsFromGeoJSON: PublicReportItem[] = (
                      geojsonData.features ?? []
                    ).map((f) => {
                      const props = f.properties as Record<string, unknown>;
                      const base = {
                        id: f.properties.id,
                        status: f.properties.status,
                        category_id: f.properties.category_id,
                        severity: f.properties.severity,
                        created_at: f.properties.created_at,
                        lat: f.geometry.coordinates[1],
                        lng: f.geometry.coordinates[0],
                        description: f.properties.description,
                      };
                      if (props.village_name) {
                        return {
                          ...base,
                          village_name: props.village_name as string,
                        };
                      }
                      if (props.report_count) {
                        return {
                          ...base,
                          report_count: props.report_count as number,
                        };
                      }
                      return base;
                    });
                    setReports(reportsFromGeoJSON);
                    setCategories(categoriesData.data ?? []);
                  })
                  .catch((e: Error) => {
                    logger.error("Failed to fetch case list", { error: e });
                    setError(e.message || "Gagal memuat data");
                  })
                  .finally(() => setLoading(false));
              }}
            />
          </div>
        )}

        <div className="flex-1 relative">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: colors.surfaceMuted }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sigap-textMuted">Memuat peta...</p>
              </div>
            ) : mapError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-4">
                  <p className="text-sigap-textMuted mb-2">
                    Peta tidak dapat dimuat
                  </p>
                  <p className="text-xs text-sigap-textTertiary">{mapError}</p>
                </div>
              </div>
            ) : (
              <MapView
                reports={filteredReports.map((r) => {
                  const cat = categories.find((c) => c.id === r.category_id);
                  return {
                    id: r.id,
                    status: r.status as import("../types").ReportStatus,
                    lat: r.lat,
                    lng: r.lng,
                    category_id: r.category_id,
                    ...(cat && {
                      category: {
                        id: r.category_id,
                        slug: r.category_id,
                        name: cat.name,
                        icon: null,
                        description: null,
                        parent_id: null,
                        created_at: "",
                      },
                    }),
                    geom: {
                      type: "Point" as const,
                      coordinates: [r.lng, r.lat] as [number, number],
                    },
                    description: r.description ?? "",
                    idempotency_key: "",
                    photo_urls: [] as string[],
                    exif_data: null,
                    device_id: null,
                    assigned_to: null,
                    assignee: null,
                    severity: r.severity,
                    priority_score: null,
                    priority_bucket: null,
                    created_at: r.created_at,
                    updated_at: r.created_at,
                  };
                })}
                height="100%"
                renderPopup={(report) => (
                  <div className="min-w-[200px]">
                    <p className="font-semibold text-sm text-sigap-textPrimary line-clamp-2 mb-2">
                      {(report.description || report.category?.name) ??
                        "Kasus #" + report.id.slice(0, 8)}
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusStyle(report.status)}`}
                      >
                        {getStatusLabel(report.status)}
                      </span>
                    </div>
                    <p className="text-xs text-sigap-textTertiary mb-2">
                      Pembaruan:{" "}
                      {new Date(report.updated_at).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <Link
                      to={`/public/cases/${report.id}`}
                      className="block w-full text-center px-3 py-1.5 bg-sigap-primary text-white text-xs font-medium rounded hover:bg-sigap-primaryHover transition-colors"
                    >
                      Lihat Detail
                    </Link>
                  </div>
                )}
              />
            )}
          </div>

          <div
            className="absolute left-4 bottom-4 bg-white border rounded-[10px] px-3.5 py-3 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.3)] z-10"
            style={{ borderColor: colors.borderCard }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.textTertiary }}
            >
              Status kasus
            </p>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="inline-flex items-center gap-2">
                <span
                  className="w-[11px] h-[11px] rounded-full"
                  style={{ backgroundColor: colors.info }}
                ></span>
                <span style={{ color: colors.textPrimary }}>Terverifikasi</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span
                  className="w-[11px] h-[11px] rounded-full"
                  style={{ backgroundColor: colors.warning }}
                ></span>
                <span style={{ color: colors.textPrimary }}>
                  Menunggu verifikasi
                </span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span
                  className="w-[11px] h-[11px] rounded-full"
                  style={{ backgroundColor: colors.primary }}
                ></span>
                <span style={{ color: colors.textPrimary }}>
                  Sedang ditangani
                </span>
              </div>
            </div>
          </div>

          <div
            className="absolute right-4 bottom-4 bg-white border rounded-lg px-3 py-2 text-[11px] max-w-[220px] leading-relaxed z-10 shadow-sm"
            style={{
              borderColor: colors.borderCard,
              color: colors.textTertiary,
            }}
          >
            Peta menunjukkan gambaran wilayah laporan. Buka detail laporan untuk
            mengikuti penanganan.
          </div>
        </div>

        <div
          className="w-[400px] border-l flex flex-col bg-white shrink-0"
          style={{ borderColor: colors.borderCard }}
        >
          <div
            className="p-3.5 border-b"
            style={{ borderColor: colors.borderCard }}
          >
            <input
              type="text"
              placeholder="Cari kasus atau fasilitas…"
              className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none"
              style={{
                backgroundColor: colors.bgSurface,
                borderColor: colors.borderCard,
                color: colors.textTertiary,
              }}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
            {loading ? (
              <p
                className="text-center py-8 text-sm"
                style={{ color: colors.textMuted }}
              >
                Memuat…
              </p>
            ) : (filteredReports?.length ?? 0) === 0 ? (
              <EmptyState
                icon={
                  <svg
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                title="Tidak ada kasus"
                subtitle="Ubah pencarian atau hapus filter untuk melihat laporan di wilayah lain."
              />
            ) : (
              filteredReports.map((report) => (
                <Link
                  key={report.id}
                  to={`/public/cases/${report.id}`}
                  className="block"
                >
                  <SigapCard
                    className="hover:opacity-90 transition-all flex gap-3 cursor-pointer"
                    style={{ borderColor: colors.borderCard }}
                  >
                    <span
                      className="w-[36px] h-[36px] rounded-[9px] flex items-center justify-center font-mono font-bold text-[11px] shrink-0"
                      style={{
                        backgroundColor: colors.primaryLight,
                        color: colors.primary,
                      }}
                    >
                      {getCategoryCode(report.category_id)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[12px] font-semibold leading-[1.5] truncate"
                        style={{ color: colors.textPrimary }}
                      >
                        {report.description ||
                          getCategoryName(report.category_id)}
                      </div>
                      <div
                        className="text-[10px] leading-relaxed"
                        style={{ color: colors.textMuted }}
                      >
                        {report.village_name ? `${report.village_name} · ` : ""}
                        {getTimeAgo(report.created_at)}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge
                          tone={getStatusBadgeTone(report.status)}
                          label={getStatusLabel(report.status)}
                          size="sm"
                        />
                        {report.report_count && report.report_count > 1 && (
                          <span
                            className="text-[10px]"
                            style={{ color: colors.textMuted }}
                          >
                            {report.report_count} laporan
                          </span>
                        )}
                      </div>
                    </div>
                  </SigapCard>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
