import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapView } from "../../components/MapView";
import { ShareLinkButton } from "../../components/ShareLinkButton";
import { colors, statusColor, statusLabel } from "../../theme/tokens";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";
import type { Report } from "../../types";

interface PublicFeature {
  id: string;
  status: string;
  severity: number | null;
  category: string;
  coordinates: [number, number];
  created_at: string;
  description: string;
}

export const PublicHome = () => {
  const [features, setFeatures] = useState<PublicFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    api.geojson()
      .then((data) =>
        setFeatures(
          data.features.map((f) => ({
            id: f.properties.id,
            status: f.properties.status,
            severity: f.properties.severity,
            category: f.properties.category_id,
            coordinates: f.geometry.coordinates,
            created_at: f.properties.created_at,
            description: f.properties.description ?? "",
          })),
        ),
      )
      .catch((e: Error) => {
        logger.error("Failed to fetch geojson", { error: e });
        setError(e.message || "Gagal memuat data");
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: features.length,
    resolved: features.filter((f) => f.status === "resolved").length,
    inProgress: features.filter(
      (f) =>
        f.status === "in_progress" ||
        f.status === "verified" ||
        f.status === "under_review",
    ).length,
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
          <span className="text-sigap-primary font-semibold">Ringkasan</span>
          <Link to="/public/cases" className="hover:text-sigap-primary transition-colors">Peta &amp; Daftar</Link>
          <Link to="/public/statistics" className="hover:text-sigap-primary transition-colors">Statistik</Link>
          <Link to="/methodology" className="hover:text-sigap-primary transition-colors">Metodologi</Link>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Total Kasus" value={stats.total} />
          <StatCard
            label="Selesai"
            value={stats.resolved}
            color={colors.selesai}
          />
          <StatCard
            label="Dalam Proses"
            value={stats.inProgress}
            color={colors.diproses}
          />
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div
          className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
          style={{ height: 600 }}
        >
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
              reports={features.map((f) => ({
                id: f.id,
                status: f.status as import("../../types").ReportStatus,
                lat: f.coordinates[1],
                lng: f.coordinates[0],
                category_id: f.category,
                category: {
                  id: "",
                  slug: f.category,
                  name: f.category,
                  icon: null,
                  description: null,
                  parent_id: null,
                  created_at: "",
                },
                geom: { type: "Point" as const, coordinates: f.coordinates as [number, number] },
                description: f.description,
                idempotency_key: "",
                photo_urls: [],
                exif_data: null,
                device_id: null,
                assigned_to: null,
                assignee: null,
                severity: f.severity,
                created_at: f.created_at,
                updated_at: f.created_at,
              }))}
              height="600px"
              renderPopup={(report) => (
                <div className="min-w-[200px]">
                  <p className="font-semibold text-sm text-sigap-textPrimary line-clamp-2 mb-2">
                    {(report.description || report.category?.name) ?? ("Kasus #" + report.id.slice(0, 8))}
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
                  <p className="text-xs text-sigap-textTertiary mb-2">
                    Update: {new Date(report.updated_at).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <Link
                    to={`/case/${report.id}`}
                    className="block w-full text-center px-3 py-1.5 bg-sigap-primary text-white text-xs font-medium rounded hover:bg-sigap-primary/90 transition-colors"
                  >
                    Lihat Detail
                  </Link>
                </div>
              )}
            />
          )}
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/methodology"
            className="text-sm text-sigap-primary hover:underline"
          >
            Lihat metodologi
          </Link>
        </div>
      </main>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) => (
  <div className="bg-white rounded-xl p-4 border border-neutral-200">
    <div
      className="text-3xl font-bold tracking-tight"
      style={{ color: color ?? colors.textPrimary }}
    >
      {value}
    </div>
    <div className="text-sm text-sigap-textTertiary mt-1">{label}</div>
  </div>
);