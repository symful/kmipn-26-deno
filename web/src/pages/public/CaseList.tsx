import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { MapView } from "../../components/MapView";
import { ShareLinkButton } from "../../components/ShareLinkButton";
import type { GeoJSONFeatureCollection } from "../../types";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "submitted", label: "Perlu Tindakan", color: "bg-red-100 text-red-700" },
  { value: "under_review", label: "Sedang Ditinjau", color: "bg-blue-100 text-blue-700" },
  { value: "verified", label: "Terverifikasi", color: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "Sedang Dikerjakan", color: "bg-blue-100 text-blue-700" },
  { value: "needs_survey", label: "Perlu Survei", color: "bg-yellow-100 text-yellow-700" },
  { value: "resolved", label: "Selesai", color: "bg-teal-50 text-teal-700" },
  { value: "rejected", label: "Ditolak", color: "bg-red-100 text-red-700" },
];

const WILAYAH_OPTIONS = [
  { value: "", label: "Semua Wilayah" },
  { value: "cisarua", label: "Kec. Cisarua" },
  { value: "ciburuy", label: "Desa Ciburuy" },
  { value: "kaler", label: "Desa Kaler" },
  { value: "girang", label: "Desa Girang" },
  { value: "wetan", label: "Desa Wetan" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "Semua Prioritas" },
  { value: "high", label: "Prioritas Tinggi" },
  { value: "medium", label: "Prioritas Sedang" },
  { value: "low", label: "Prioritas Rendah" },
];

interface PublicReportItem {
  id: string;
  status: string;
  category_id: string;
  severity: number | null;
  created_at: string;
  lat: number;
  lng: number;
  description?: string;
}

export const PublicCaseList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<PublicReportItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const selectedWilayah = searchParams.get("wilayah") ?? "";
  const selectedCategory = searchParams.get("category") ?? "";
  const selectedStatus = searchParams.get("status") ?? "";
  const selectedPriority = searchParams.get("priority") ?? "";

  useEffect(() => {
    Promise.all([api.geojson(), api.categories()])
      .then(([geojsonData, categoriesData]) => {
        const reportsFromGeoJSON: PublicReportItem[] = geojsonData.features.map((f) => ({
          id: f.properties.id,
          status: f.properties.status,
          category_id: f.properties.category_id,
          severity: f.properties.severity,
          created_at: f.properties.created_at,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          description: f.properties.description,
        }));
        setReports(reportsFromGeoJSON);
        setCategories(categoriesData.categories);
      })
      .catch((e: Error) => {
        logger.error("Failed to fetch case list", { error: e });
        setError(e.message || "Gagal memuat data");
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = reports.filter((report) => {
    if (selectedCategory && report.category_id !== selectedCategory) return false;
    if (selectedStatus && report.status !== selectedStatus) return false;
    if (selectedPriority) {
      if (selectedPriority === "high" && (report.severity ?? 0) < 0.7) return false;
      if (selectedPriority === "medium" && ((report.severity ?? 0) < 0.4 || (report.severity ?? 0) >= 0.7)) return false;
      if (selectedPriority === "low" && (report.severity ?? 0) >= 0.4) return false;
    }
    return true;
  });

  const activeFilters: { key: string; label: string }[] = [];
  if (selectedStatus) {
    const s = STATUS_OPTIONS.find((o) => o.value === selectedStatus);
    activeFilters.push({ key: "status", label: s?.label ?? selectedStatus });
  }
  if (selectedPriority) {
    const p = PRIORITY_OPTIONS.find((o) => o.value === selectedPriority);
    activeFilters.push({ key: "priority", label: p?.label ?? selectedPriority });
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

  const getCategoryInitials = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    const name = cat?.name ?? categoryId;
    return name.slice(0, 2).toUpperCase();
  };

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.name ?? categoryId;
  };

  const getStatusStyle = (status: string) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    return opt?.color ?? "bg-gray-100 text-gray-700";
  };

  const getStatusLabel = (status: string) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    return opt?.label ?? status;
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
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

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-white border-b border-neutral-200 px-7 py-[15px]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-[7px] bg-sigap-primary flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <span className="text-base font-bold tracking-tight text-sigap-textPrimary">PantauDesa</span>
          <span className="text-xs text-sigap-textTertiary bg-neutral-100 rounded px-2 py-0.5 ml-1">Portal Publik</span>
        </div>
        <div className="flex gap-6 text-sm text-sigap-textTertiary mt-3 ml-10">
          <Link to="/" className="hover:text-sigap-primary transition-colors">Ringkasan</Link>
          <Link to="/public/cases" className="text-sigap-primary font-semibold">Peta &amp; Daftar</Link>
          <Link to="/public/statistics" className="hover:text-sigap-primary transition-colors">Statistik</Link>
          <Link to="/methodology" className="hover:text-sigap-primary transition-colors">Metodologi</Link>
        </div>
      </header>

      <div className="bg-neutral-50 border-b border-neutral-200 px-7 py-[13px] flex items-center gap-2.5">
        <select
          value={selectedWilayah}
          onChange={(e) => handleFilterChange("wilayah", e.target.value)}
          className="bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-sigap-textPrimary font-medium focus:outline-none focus:border-sigap-primary"
        >
          {WILAYAH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => handleFilterChange("category", e.target.value)}
          className="bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
        >
          <option value="">Semua Kategori</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {activeFilters.map((filter) => (
          <div
            key={filter.key}
            className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5 text-xs font-semibold text-teal-700"
          >
            {filter.label}
            <button
              onClick={() => removeFilter(filter.key)}
              className="hover:text-teal-900 transition-colors"
            >
              ✕
            </button>
          </div>
        ))}

        {activeFilters.length > 0 && (
          <button
            onClick={resetFilters}
            className="text-xs text-sigap-primary font-semibold hover:underline ml-1"
          >
            Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-sigap-textTertiary">
            <span className="font-bold text-sigap-textPrimary">{filteredReports.length}</span> kasus
          </span>
          <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("map")}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "map"
                  ? "bg-sigap-primary text-white"
                  : "bg-white text-sigap-textTertiary hover:bg-neutral-50"
              }`}
            >
              Peta
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "list"
                  ? "bg-sigap-primary text-white"
                  : "bg-white text-sigap-textTertiary hover:bg-neutral-50"
              }`}
            >
              Daftar
            </button>
          </div>
        </div>
      </div>

      <main className="flex h-[calc(100vh-140px)]">
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className={`flex-1 relative ${viewMode === "list" ? "hidden" : "block"}`}>
          <div className="absolute inset-0 bg-neutral-200">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sigap-textMuted">Memuat peta...</p>
              </div>
            ) : mapError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-4">
                  <p className="text-sigap-textMuted mb-2">Peta tidak dapat dimuat</p>
                  <p className="text-xs text-sigap-textTertiary">{mapError}</p>
                </div>
              </div>
            ) : (
              <MapView
                reports={filteredReports.map((r) => {
                  const cat = categories.find((c) => c.id === r.category_id);
                  return {
                    id: r.id,
                    status: r.status as import("../../types").ReportStatus,
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
                    geom: { type: "Point" as const, coordinates: [r.lng, r.lat] as [number, number] },
                    description: r.description ?? "",
                    idempotency_key: "",
                    photo_urls: [] as string[],
                    exif_data: null,
                    device_id: null,
                    assigned_to: null,
                    assignee: null,
                    severity: r.severity,
                    created_at: r.created_at,
                    updated_at: r.created_at,
                  };
                })}
                height="100%"
                renderPopup={(report) => (
                  <div className="min-w-[200px]">
                    <p className="font-semibold text-sm text-sigap-textPrimary line-clamp-2 mb-2">
                      {(report.description || report.category?.name) ?? ("Kasus #" + report.id.slice(0, 8))}
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusStyle(report.status)}`}
                      >
                        {getStatusLabel(report.status)}
                      </span>
                    </div>
                    <p className="text-xs text-sigap-textTertiary mb-2">
                      Update: {new Date(report.updated_at).toLocaleDateString("id-ID", {
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

          <div className="absolute left-4 bottom-4 bg-white border border-neutral-200 rounded-xl p-3 shadow-md">
            <p className="text-xs font-bold text-sigap-textTertiary uppercase tracking-wide mb-2">Status kasus</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="text-sigap-textSecondary">Terverifikasi</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                <span className="text-sigap-textSecondary">Menunggu verifikasi</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-sigap-primary"></span>
                <span className="text-sigap-textSecondary">Sedang ditangani</span>
              </div>
            </div>
          </div>

          <div className="absolute right-4 bottom-4 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-xs text-sigap-textTertiary max-w-[200px] leading-relaxed shadow-md">
            Lokasi digeneralisasi untuk melindungi privasi pelapor.
          </div>
        </div>

        <div className={`w-[400px] border-l border-neutral-200 flex flex-col bg-neutral-50 ${viewMode === "map" ? "hidden" : "block"}`}>
          <div className="p-3.5 border-b border-neutral-200">
            <input
              type="text"
              placeholder="Cari wilayah atau fasilitas..."
              className="w-full bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-sigap-textTertiary focus:outline-none focus:border-sigap-primary"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {loading ? (
              <p className="text-center text-sigap-textMuted py-8">Memuat...</p>
            ) : filteredReports.length === 0 ? (
              <p className="text-center text-sigap-textMuted py-8">
                Tidak ada kasus yang sesuai filter
              </p>
            ) : (
              filteredReports.map((report) => (
                <Link
                  key={report.id}
                  to={`/public/cases/${report.id}`}
                  className="bg-white border border-neutral-200 rounded-xl p-3.5 hover:border-sigap-primary transition-colors flex gap-3"
                >
                  <span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-mono font-semibold text-xs flex-none">
                    {getCategoryInitials(report.category_id)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-sigap-textPrimary truncate">
                      {getCategoryName(report.category_id)}
                    </div>
                    <div className="text-xs text-sigap-textTertiary mt-0.5">
                      diperbarui {getTimeAgo(report.created_at)}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getStatusStyle(report.status)}`}>
                        {getStatusLabel(report.status)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};