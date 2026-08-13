import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { MapView } from "../../components/MapView";
import { ShareLinkButton } from "../../components/ShareLinkButton";
import type { GeoJSONFeatureCollection } from "../../types";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "submitted", label: "Perlu Tindakan" },
  { value: "under_review", label: "Sedang Ditinjau" },
  { value: "verified", label: "Terverifikasi" },
  { value: "in_progress", label: "Sedang Dikerjakan" },
  { value: "needs_survey", label: "Perlu Survei" },
  { value: "resolved", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
];

interface PublicReportItem {
  id: string;
  status: string;
  category_id: string;
  severity: number | null;
  created_at: string;
  lat: number;
  lng: number;
}

export const PublicCaseList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<PublicReportItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const selectedCategory = searchParams.get("category") ?? "";
  const selectedStatus = searchParams.get("status") ?? "";

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
    return true;
  });

  const handleCategoryChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set("category", value);
    } else {
      newParams.delete("category");
    }
    setSearchParams(newParams);
  };

  const handleStatusChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set("status", value);
    } else {
      newParams.delete("status");
    }
    setSearchParams(newParams);
  };

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.name ?? categoryId;
  };

  const getStatusLabel = (status: string) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    return opt?.label ?? status;
  };

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Daftar Kasus</h1>
              <p className="text-sm text-sigap-textTertiary">
                SIGAP - Platform pemetaan & monitoring
              </p>
            </div>
          </div>
          <ShareLinkButton
            filters={{ category: selectedCategory, status: selectedStatus }}
            label="Bagikan Tautan"
          />
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="bg-white rounded-lg p-4 border border-sigap-border mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm text-sigap-textTertiary mb-1">
                Kategori
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm text-sigap-textTertiary mb-1">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                <option value="">Semua Status</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(selectedCategory || selectedStatus) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-sigap-textTertiary">
                Menampilkan {filteredReports.length} dari {reports.length} kasus
              </span>
              <button
                onClick={() => setSearchParams(new URLSearchParams())}
                className="text-sm text-sigap-primary hover:underline"
              >
                Reset filter
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg overflow-hidden border border-sigap-border">
            <div className="p-4 border-b border-sigap-border">
              <h2 className="font-semibold text-sigap-textPrimary">
                Daftar Kasus ({filteredReports.length})
              </h2>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto space-y-3">
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
                    className="block bg-white rounded-lg p-4 border border-sigap-border hover:border-sigap-primary transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-sigap-textPrimary truncate">
                          {getCategoryName(report.category_id)}
                        </p>
                        <p className="text-xs text-sigap-textTertiary mt-1">
                          {new Date(report.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                        style={{
                          backgroundColor:
                            report.status === "resolved"
                              ? colors.selesai + "20"
                              : report.status === "rejected"
                                ? colors.perluTindakan + "20"
                                : colors.diproses + "20",
                          color:
                            report.status === "resolved"
                              ? colors.selesai
                              : report.status === "rejected"
                                ? colors.perluTindakan
                                : colors.diproses,
                        }}
                      >
                        {getStatusLabel(report.status)}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg overflow-hidden border border-sigap-border">
            <div className="p-4 border-b border-sigap-border">
              <h2 className="font-semibold text-sigap-textPrimary">Peta Lokasi</h2>
            </div>
            <div className="h-[600px]">
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
                      description: "",
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
                  height="600px"
                />
              )}
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link
            to="/"
            className="text-sm text-sigap-primary hover:underline"
          >
            ← Kembali ke Beranda
          </Link>
        </div>
      </main>
    </div>
  );
};
