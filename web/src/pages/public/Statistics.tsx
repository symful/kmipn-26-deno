import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { ShareLinkButton } from "../../components/ShareLinkButton";
import { colors, statusColor, statusLabel } from "../../theme/tokens";
import type { DashboardStats } from "../../types";
import { logger } from "@/lib/logger";

const STATUS_ORDER = [
  "submitted",
  "under_review",
  "verified",
  "in_progress",
  "needs_survey",
  "resolved",
  "rejected",
  "duplicate_merged",
];

const TIME_PERIOD_OPTIONS = [
  { value: "7d", label: "7 Hari Terakhir" },
  { value: "30d", label: "30 Hari Terakhir" },
  { value: "90d", label: "90 Hari Terakhir" },
  { value: "1y", label: "1 Tahun Terakhir" },
  { value: "all", label: "Semua Waktu" },
];

const WILAYAH_OPTIONS = [
  { value: "", label: "Semua Wilayah" },
  { value: "cisarua", label: "Kec. Cisarua" },
  { value: "ciburuy", label: "Desa Ciburuy" },
  { value: "kaler", label: "Desa Kaler" },
  { value: "girang", label: "Desa Girang" },
  { value: "wetan", label: "Desa Wetan" },
];

export const PublicStatistics = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [geojsonStats, setGeojsonStats] = useState<{
    total: number;
    by_status: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWilayah, setSelectedWilayah] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("30d");

  useEffect(() => {
    Promise.all([api.publicStats(), api.geojson()])
      .then(([statsData, geojsonData]) => {
        setStats(statsData);
        const byStatus: Record<string, number> = {};
        geojsonData.features.forEach((f) => {
          const s = f.properties.status;
          byStatus[s] = (byStatus[s] ?? 0) + 1;
        });
        setGeojsonStats({ total: geojsonData.features.length, by_status: byStatus });
      })
      .catch((e: Error) => {
        logger.error("Failed to fetch statistics", { error: e });
        setError(e.message || "Gagal memuat statistik");
      })
      .finally(() => setLoading(false));
  }, []);

  const total = geojsonStats?.total ?? 0;
  const byStatus = geojsonStats?.by_status ?? {};
  const byCategory = stats?.by_category.map((c) => ({
    category_name: c.name,
    count: c.count,
  })) ?? [];
  const slaBreached = stats?.sla_breached ?? 0;
  const slaAtRisk = stats?.sla_at_risk ?? 0;

  const resolvedCount = byStatus["resolved"] ?? 0;
  const avgDays = stats?.avg_verification_days ?? 0;
  const SLA_DAYS_THRESHOLD = 30;
  const slaCompliance = avgDays > 0 ? Math.max(0, Math.round(100 - (avgDays / SLA_DAYS_THRESHOLD) * 100)) : 0;

  const maxStatusCount = Math.max(...Object.values(byStatus), 1);
  const maxCategoryCount = Math.max(...byCategory.map((c) => c.count), 1);

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* P-02 White Header */}
      <header className="bg-white border-b border-neutral-200 px-7 py-[15px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[7px] bg-sigap-primary flex items-center justify-center text-white font-bold text-sm">
              P
            </div>
            <span className="text-base font-bold tracking-tight text-sigap-textPrimary">PantauDesa</span>
            <span className="text-xs text-sigap-textTertiary bg-neutral-100 rounded px-2 py-0.5 ml-1">Portal Publik</span>
          </div>
          <div className="flex items-center gap-3">
            <ShareLinkButton filters={{}} label="Bagikan" />
          </div>
        </div>
        <div className="flex gap-6 text-sm text-sigap-textTertiary mt-3 ml-10">
          <Link to="/" className="hover:text-sigap-primary transition-colors">Ringkasan</Link>
          <Link to="/public/cases" className="hover:text-sigap-primary transition-colors">Peta &amp; Daftar</Link>
          <Link to="/public/statistics" className="text-sigap-primary font-semibold">Statistik</Link>
          <Link to="/methodology" className="hover:text-sigap-primary transition-colors">Metodologi</Link>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-7 py-[13px] flex items-center gap-2.5">
        <select
          value={selectedWilayah}
          onChange={(e) => setSelectedWilayah(e.target.value)}
          className="bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-sigap-textPrimary font-medium focus:outline-none focus:border-sigap-primary"
        >
          {WILAYAH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
        >
          {TIME_PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-sigap-textTertiary">
            Periode: <span className="font-bold text-sigap-textPrimary">
              {TIME_PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.label}
            </span>
          </span>
        </div>
      </div>

      <main className="p-6 max-w-7xl mx-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sigap-textMuted">Memuat statistik...</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Total Laporan"
                value={total}
                color={colors.textPrimary}
              />
              <StatCard
                label="Selesai"
                value={byStatus["resolved"] ?? 0}
                color={colors.selesai}
              />
              <StatCard
                label="Sedang Diproses"
                value={
                  (byStatus["under_review"] ?? 0) +
                  (byStatus["verified"] ?? 0) +
                  (byStatus["in_progress"] ?? 0)
                }
                color={colors.diproses}
              />
              <StatCard
                label="Perlu Tindakan"
                value={(byStatus["submitted"] ?? 0) + (byStatus["needs_survey"] ?? 0)}
                color={colors.perluTindakan}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Status Distribution */}
              <div className="bg-white rounded-xl p-6 border border-neutral-200">
                <h2 className="text-lg font-semibold text-sigap-textPrimary mb-4">
                  Distribusi Status
                </h2>
                <div className="space-y-3">
                  {STATUS_ORDER.filter((s) => byStatus[s]).map((status) => {
                    const count = byStatus[status] ?? 0;
                    const percentage = Math.round((count / maxStatusCount) * 100);
                    const color = statusColor(status);
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-sigap-textSecondary">
                            {statusLabel(status)}
                          </span>
                          <span className="text-sm font-medium text-sigap-textPrimary">
                            {count}
                          </span>
                        </div>
                        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Distribution */}
              <div className="bg-white rounded-xl p-6 border border-neutral-200">
                <h2 className="text-lg font-semibold text-sigap-textPrimary mb-4">
                  Distribusi Kategori
                </h2>
                <div className="space-y-3">
                  {byCategory.length === 0 ? (
                    <p className="text-sigap-textMuted text-sm text-center py-4">
                      Data kategori tidak tersedia
                    </p>
                  ) : (
                    byCategory.map((cat) => {
                      const percentage = Math.round((cat.count / maxCategoryCount) * 100);
                      return (
                        <div key={cat.category_name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-sigap-textSecondary">
                              {cat.category_name}
                            </span>
                            <span className="text-sm font-medium text-sigap-textPrimary">
                              {cat.count}
                            </span>
                          </div>
                          <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: colors.primary,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* SLA Compliance */}
            <div className="bg-white rounded-xl p-6 border border-neutral-200">
              <h2 className="text-lg font-semibold text-sigap-textPrimary mb-4">
                Kepatuhan SLA
              </h2>
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e4e7e2"
                      strokeWidth="12"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={slaCompliance >= 80 ? colors.selesai : colors.perluTindakan}
                      strokeWidth="12"
                      strokeDasharray={`${slaCompliance * 2.51} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold" style={{ color: slaCompliance >= 80 ? colors.selesai : colors.perluTindakan }}>
                      {slaCompliance}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.selesai }} />
                    <span className="text-sm text-sigap-textSecondary">
                      Dalam SLA: {total - slaBreached - slaAtRisk}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.diproses }} />
                    <span className="text-sm text-sigap-textSecondary">
                      Berisiko: {slaAtRisk}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.perluTindakan }} />
                    <span className="text-sm text-sigap-textSecondary">
                      Melanggar SLA: {slaBreached}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="mt-6 text-center">
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

const StatCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div className="bg-white rounded-xl p-4 border border-neutral-200">
    <div className="text-3xl font-bold tracking-tight" style={{ color }}>
      {value}
    </div>
    <div className="text-sm text-sigap-textTertiary mt-1">{label}</div>
  </div>
);
