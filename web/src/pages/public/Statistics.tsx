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

export const PublicStatistics = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [geojsonStats, setGeojsonStats] = useState<{
    total: number;
    by_status: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              <h1 className="text-xl font-bold tracking-tight">Statistik</h1>
              <p className="text-sm text-sigap-textTertiary">
                SIGAP - Platform pemetaan & monitoring
              </p>
            </div>
          </div>
          <ShareLinkButton filters={{}} label="Bagikan" />
        </div>
      </header>

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg p-6 border border-sigap-border">
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
                        <div className="h-3 bg-sigap-background rounded-full overflow-hidden">
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

              <div className="bg-white rounded-lg p-6 border border-sigap-border">
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
                          <div className="h-3 bg-sigap-background rounded-full overflow-hidden">
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

            <div className="bg-white rounded-lg p-6 border border-sigap-border">
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
  <div className="bg-white rounded-lg p-4 border border-sigap-border">
    <div className="text-3xl font-bold tracking-tight" style={{ color }}>
      {value}
    </div>
    <div className="text-sm text-sigap-textTertiary mt-1">{label}</div>
  </div>
);
