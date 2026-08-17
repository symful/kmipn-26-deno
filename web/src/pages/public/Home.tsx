import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapView } from "../../components/MapView";
import { FilterBar } from "../../components/public/FilterBar";
import { CaseListRail } from "../../components/public/CaseListRail";
import { MapLegend } from "../../components/public/MapLegend";
import { colors, extendedColors, statusColor, statusLabel } from "../../theme/tokens";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";
import type { PublicReport } from "../../types";

export const PublicHome = () => {
  const [features, setFeatures] = useState<PublicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedWilayah, setSelectedWilayah] = useState("");
  const [selectedKategori, setSelectedKategori] = useState("");
  const [viewMode, setViewMode] = useState<"peta" | "daftar">("peta");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [wilayahOptions, setWilayahOptions] = useState<{ value: string; label: string }[]>([]);
  const [kategoriOptions, setKategoriOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    api.wilayah().then((result) => setWilayahOptions(result.wilayah.map((w) => ({ value: w.id, label: w.name })))).catch((e: Error) => {
      logger.error("Failed to fetch wilayah", { error: e });
    });
  }, []);

  useEffect(() => {
    api.categories().then((result) => setKategoriOptions(result.categories.map((c) => ({ value: c.id, label: c.name })))).catch((e: Error) => {
      logger.error("Failed to fetch categories", { error: e });
    });
  }, []);

  useEffect(() => {
    const params: { status?: string; category_id?: string; month?: string } = {};
    if (selectedWilayah) {
      params.status = selectedWilayah;
    }
    if (selectedKategori) {
      params.category_id = selectedKategori;
    }
    if (activeFilters.length > 0) {
      params.month = "2026-07";
    }

    api.publicReports(params)
      .then(({ reports }) => setFeatures(reports))
      .catch((e: Error) => {
        logger.error("Failed to fetch public reports", { error: e });
        setError(e.message || "Gagal memuat data");
      })
      .finally(() => setLoading(false));
  }, [selectedWilayah, selectedKategori, activeFilters]);

  const handleRemoveFilter = (filter: string) => {
    setActiveFilters((prev) => prev.filter((f) => f !== filter));
  };

  const handleResetFilters = () => {
    setSelectedWilayah("");
    setSelectedKategori("");
    setActiveFilters([]);
  };

  const stats = {
    total: features.length,
    verified: features.filter((f) => f.status === "verified").length,
    inProgress: features.filter((f) => f.status === "in_progress").length,
    resolved: features.filter((f) => f.status === "resolved").length,
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.bgSurface }}>
      <header
        className="flex items-center px-7 flex-shrink-0"
        style={{ height: 60, borderBottom: `1px solid ${colors.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 28,
              height: 28,
              backgroundColor: colors.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            P
          </div>
          <span
            className="font-bold"
            style={{ fontSize: 16, color: colors.textPrimary }}
          >
            PantauDesa
          </span>
          <span
            className="text-xs rounded px-2 py-0.5"
            style={{
              fontSize: 12,
              color: colors.textTertiary,
              backgroundColor: extendedColors.bgSoft,
              marginLeft: 2,
            }}
          >
            Portal Publik
          </span>
        </div>

        <div
          className="flex gap-5.5 ml-8"
          style={{ fontSize: 13, color: colors.textTertiary }}
        >
          <Link
            to="/public"
            className="hover:no-underline"
            style={{ color: colors.textTertiary }}
          >
            Ringkasan
          </Link>
          <Link
            to="/public/peta"
            className="font-semibold hover:no-underline"
            style={{ color: colors.primary }}
          >
            Peta & Daftar
          </Link>
          <Link
            to="/public/statistics"
            className="hover:no-underline"
            style={{ color: colors.textTertiary }}
          >
            Statistik
          </Link>
          <Link
            to="/methodology"
            className="hover:no-underline"
            style={{ color: colors.textTertiary }}
          >
            Metodologi
          </Link>
        </div>

        <div className="flex items-center gap-2.5 ml-auto">
          <Link
            to="/login"
            className="px-3.5 py-2 rounded-lg border font-semibold hover:opacity-90 transition-opacity"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              borderColor: colors.border,
              color: colors.textSecondary,
              backgroundColor: colors.bgCard,
            }}
          >
            Masuk
          </Link>
          <Link
            to="/warga/new"
            className="px-3.5 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity"
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              border: 0,
              backgroundColor: colors.primary,
              color: "#fff",
            }}
          >
            Buat Laporan
          </Link>
        </div>
      </header>

      <FilterBar
        wilayahOptions={wilayahOptions}
        kategoriOptions={kategoriOptions}
        selectedWilayah={selectedWilayah}
        selectedKategori={selectedKategori}
        viewMode={viewMode}
        activeFilters={activeFilters}
        onWilayahChange={setSelectedWilayah}
        onKategoriChange={setSelectedKategori}
        onViewModeChange={setViewMode}
        onRemoveFilter={handleRemoveFilter}
        onResetFilters={handleResetFilters}
        totalCount={features.length}
      />

      <main className="flex-1 flex flex-col p-7 gap-4 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-3">
          <div
            className="rounded-xl p-4 border"
            style={{
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
            }}
          >
            <div
              className="font-bold tracking-tight"
              style={{ fontSize: 30, color: colors.textPrimary }}
            >
              {stats.total}
            </div>
            <div className="text-sm mt-1" style={{ color: colors.textTertiary }}>
              Total Kasus
            </div>
          </div>
          <div
            className="rounded-xl p-4 border"
            style={{
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
            }}
          >
            <div
              className="font-bold tracking-tight"
              style={{ fontSize: 30, color: colors.diproses }}
            >
              {stats.inProgress}
            </div>
            <div className="text-sm mt-1" style={{ color: colors.textTertiary }}>
              Sedang Ditangani
            </div>
          </div>
          <div
            className="rounded-xl p-4 border"
            style={{
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
            }}
          >
            <div
              className="font-bold tracking-tight"
              style={{ fontSize: 30, color: colors.selesai }}
            >
              {stats.resolved}
            </div>
            <div className="text-sm mt-1" style={{ color: colors.textTertiary }}>
              Selesai
            </div>
          </div>
        </div>

        {error && (
          <div
            className="mb-4 p-4 rounded-lg text-sm"
            style={{
              backgroundColor: colors.dangerBg,
              border: `1px solid ${colors.danger}`,
              color: colors.danger,
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-4" style={{ height: 500 }}>
          <div
            className="flex-1 rounded-xl border overflow-hidden relative"
            style={{
              backgroundColor: "#eaeee9",
              borderColor: colors.border,
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full">
              </div>
            ) : mapError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-4">
                  <p className="mb-2" style={{ color: colors.textMuted }}>
                    Peta tidak dapat dimuat
                  </p>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {mapError}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <MapView
                  reports={features.map((f) => ({
                    id: f.id,
                    status: f.status as import("../../types").ReportStatus,
                    lat: f.generalized_location?.lat ?? 0,
                    lng: f.generalized_location?.lng ?? 0,
                    category_id: f.category?.id ?? "",
                    category: {
                      id: f.category?.id ?? "",
                      slug: f.category?.short_code ?? "",
                      name: f.category?.name ?? "",
                      icon: f.category?.icon ?? null,
                      description: null,
                      parent_id: null,
                      created_at: "",
                    },
                    geom: {
                      type: "Point" as const,
                      coordinates: [
                        f.generalized_location?.lng ?? 0,
                        f.generalized_location?.lat ?? 0,
                      ] as [number, number],
                    },
                    description: f.category?.name ?? "",
                    idempotency_key: "",
                    photo_urls: f.moderated_photo_url ? [f.moderated_photo_url] : [],
                    exif_data: null,
                    device_id: null,
                    assigned_to: null,
                    assignee: null,
                    severity: null,
                    created_at: f.last_updated,
                    updated_at: f.last_updated,
                  }))}
                  height="500px"
                  renderPopup={(report) => (
                    <div className="min-w-[200px]">
                      <p
                        className="font-semibold text-sm line-clamp-2 mb-2"
                        style={{ color: colors.textPrimary }}
                      >
                        {report.category?.name ?? ("Kasus #" + report.id.slice(0, 8))}
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: statusColor(report.status) + "20",
                            color: statusColor(report.status),
                          }}
                        >
                          {statusLabel(report.status)}
                        </span>
                      </div>
                      <p className="text-xs mb-2" style={{ color: colors.textTertiary }}>
                        Update: {new Date(report.updated_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <Link
                        to={`/case/${report.id}`}
                        className="block w-full text-center px-3 py-1.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: colors.primary,
                          color: "#fff",
                        }}
                      >
                        Lihat Detail
                      </Link>
                    </div>
                  )}
                />
                <div
                  className="absolute z-10"
                  style={{ left: 16, bottom: 16 }}
                >
                  <MapLegend />
                </div>
              </>
            )}
          </div>

          {viewMode === "daftar" && (
            <CaseListRail
              items={features.map((f) => {
                const initials = f.category?.short_code
                  ? f.category.short_code.slice(0, 2).toUpperCase()
                  : f.category?.name
                    ? f.category.name.slice(0, 2).toUpperCase()
                    : "CA";
                const statusBg =
                  f.status === "verified" || f.status === "in_progress"
                    ? colors.primaryLight
                    : f.status === "resolved"
                      ? colors.selesai + "20"
                      : colors.warningBg;
                const statusTextColor =
                  f.status === "verified" || f.status === "in_progress"
                    ? colors.primaryDark
                    : f.status === "resolved"
                      ? colors.selesai
                      : colors.warning;
                return {
                  id: f.id,
                  title: f.category?.name ?? "Kasus",
                  village: f.wilayah?.desa ?? f.general_wilayah ?? "Unknown",
                  timeAgo: formatTimeAgo(f.last_updated),
                  status: statusLabel(f.status),
                  statusColor: statusTextColor,
                  statusBg: statusBg,
                  reportCount: f.supporting_count > 0 ? f.supporting_count : 1,
                  initials,
                };
              })}
              onCaseClick={(id: string) => {
                window.location.href = `/case/${id}`;
              }}
            />
          )}
        </div>

        <div className="text-center">
          <Link
            to="/methodology"
            className="text-sm hover:underline"
            style={{ color: colors.primary }}
          >
            Lihat metodologi
          </Link>
        </div>
      </main>
    </div>
  );
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      return " baru saja";
    }
    return diffHours === 1 ? "1 jam lalu" : `${diffHours} jam lalu`;
  }
  if (diffDays === 1) {
    return "kemarin";
  }
  if (diffDays < 7) {
    return `${diffDays} hari lalu`;
  }
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
