import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardStats, Report } from "../../types";
import { MapView } from "../../components/MapView";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../api/client";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

export const AdminDashboard = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"map" | "list">("list");

  useEffect(() => {
    api
      .reports()
      .then((data) => setReports(data.reports))
      .catch((e) => { logger.error("Failed to fetch reports", { error: e }); setReports([]); })
      .finally(() => setLoading(false));
    api
      .reportsStats()
      .then(setStats)
      .catch((e) => { logger.error("Failed to fetch stats", { error: e }); setStats(null); });
  }, []);

  return (
    <>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg p-3 border border-sigap-border">
            <p className="text-xs text-sigap-textMuted">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-sigap-border">
            <p className="text-xs text-sigap-textMuted">SLA Breach</p>
            <p className="text-2xl font-bold text-red-600">{stats.sla_breached}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-sigap-border">
            <p className="text-xs text-sigap-textMuted">SLA Risk</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.sla_at_risk}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-sigap-border">
            <p className="text-xs text-sigap-textMuted">In Progress</p>
            <p className="text-2xl font-bold text-blue-600">
              {(stats.by_status.in_progress ?? 0) +
               (stats.by_status.verified ?? 0) +
               (stats.by_status.assigned ?? 0)}
            </p>
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView("list")}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            view === "list"
              ? "text-white"
              : "bg-sigap-surface border border-sigap-border text-sigap-textSecondary hover:bg-sigap-border"
          }`}
          style={view === "list" ? { backgroundColor: colors.primary } : {}}
        >
          Daftar
        </button>
        <button
          onClick={() => setView("map")}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            view === "map"
              ? "text-white"
              : "bg-sigap-surface border border-sigap-border text-sigap-textSecondary hover:bg-sigap-border"
          }`}
          style={view === "map" ? { backgroundColor: colors.primary } : {}}
        >
          Peta
        </button>
      </div>

      {loading ? (
        <p className="text-sigap-textMuted">Memuat...</p>
      ) : view === "map" ? (
        <div
          className="bg-white rounded-lg overflow-hidden border border-sigap-border"
          style={{ height: 600 }}
        >
          <MapView reports={reports} height="600px" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.length === 0 ? (
            <p className="col-span-full text-center text-sigap-textMuted py-8">
              Belum ada laporan.
            </p>
          ) : (
            reports.map((r) => (
              <Link
                key={r.id}
                to={`/admin/cases/${r.id}`}
                className="bg-white rounded-lg p-4 border border-sigap-border hover:border-sigap-primary transition-colors"
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
            ))
          )}
        </div>
      )}
    </>
  );
};
