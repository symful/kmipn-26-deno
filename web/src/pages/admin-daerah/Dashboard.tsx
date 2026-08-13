import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardStats, Report } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

export const AdminDaerahDashboard = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [reportsData, statsData] = await Promise.all([
          api.reports(),
          api.reportsStats(),
        ]);
        setReports(reportsData.reports);
        setStats(statsData);
      } catch (err) {
        logger.error("Failed to fetch dashboard data", { error: err });
        setError(err instanceof Error ? err.message : "Gagal memuat data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <p className="text-sigap-textMuted">Memuat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-sigap-primary text-white rounded-lg"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const inProgressCount =
    (stats?.by_status?.in_progress ?? 0) +
    (stats?.by_status?.verified ?? 0) +
    (stats?.by_status?.assigned ?? 0);

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
              <h1 className="text-xl font-bold tracking-tight">SIGAP Admin Daerah</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
                {user?.wilayah_id && (
                  <span className="ml-1 text-sigap-primary">
                    • Lingkup: {user.wilayah_id.slice(0, 8)}...
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link
            to="/admin"
            className="text-sm font-medium text-sigap-primary hover:underline"
          >
            Beranda
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="text-xs text-sigap-textMuted">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="text-xs text-sigap-textMuted">SLA Breach</p>
              <p className="text-2xl font-bold text-red-600">{stats.sla_breached}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="text-xs text-sigap-textMuted">SLA At Risk</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.sla_at_risk}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="text-xs text-sigap-textMuted">Sedang Diproses</p>
              <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
            </div>
          </div>
        )}

        {stats?.by_category && stats.by_category.length > 0 && (
          <div className="bg-white rounded-lg border border-sigap-border p-4 mb-6">
            <h2 className="text-sm font-semibold mb-3">Distribusi per Kategori</h2>
            <div className="flex flex-wrap gap-2">
              {stats.by_category.map((cat) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-sigap-surface border border-sigap-border"
                >
                  {cat.name}: {cat.count}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-sigap-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Laporan Terbaru</h2>
            <span className="text-xs text-sigap-textMuted">
              {reports.length} laporan
            </span>
          </div>

          {reports.length === 0 ? (
            <p className="text-sigap-textMuted text-sm text-center py-8">
              Belum ada laporan.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.slice(0, 12).map((r) => (
                <Link
                  key={r.id}
                  to={`/admin-daerah/cases/${r.id}`}
                  className="rounded-lg p-4 border border-sigap-border hover:border-sigap-primary transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {r.category?.name ?? r.category_id}
                      </p>
                      <p className="text-xs text-sigap-textTertiary mt-1">
                        {new Date(r.created_at).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.severity != null && (
                    <p className="text-xs text-sigap-textMuted mt-2">
                      Severity: {r.severity}%
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}

          {reports.length > 12 && (
            <div className="mt-4 text-center">
              <Link
                to="/admin-daerah/cases"
                className="text-sm text-sigap-primary hover:underline"
              >
                Lihat semua laporan ({reports.length})
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
