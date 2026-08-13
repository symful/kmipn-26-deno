import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DashboardStats, Report } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors, statusLabel } from "../../theme/tokens";
import { toast } from "../../components/Toast";
import { logger } from "@/lib/logger";

type DrillDownFilter = {
  status?: string;
  category_id?: string;
  wilayah_id?: string;
};

export const ExecDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [wilayahMap, setWilayahMap] = useState<Record<string, string>>({});

  // Active drill-down from URL params
  const drillStatus = searchParams.get("status") ?? undefined;
  const drillCategory = searchParams.get("category_id") ?? undefined;
  const drillWilayah = searchParams.get("wilayah_id") ?? undefined;
  const hasDrillDown = !!(drillStatus || drillCategory || drillWilayah);

  // Clear drill-down
  const clearDrillDown = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // Load summary stats
  useEffect(() => {
    api
      .reportsStats()
      .then(setStats)
      .catch((e) => { logger.error("Failed to fetch reports stats", { error: e }); setStats(null); })
      .finally(() => setLoading(false));
  }, []);

  // Load wilayah list and build id->name map
  useEffect(() => {
    api.wilayah().then(({ wilayah }) => {
      const map: Record<string, string> = {};
      const flatten = (nodes: typeof wilayah) => {
        for (const node of nodes) {
          map[node.id] = node.name;
          if (node.children) flatten(node.children);
        }
      };
      flatten(wilayah);
      setWilayahMap(map);
    }).catch((e) => { logger.error("Failed to fetch wilayah", { error: e }); });
  }, []);

  // Load drilled-down reports when filters are active
  useEffect(() => {
    if (!hasDrillDown) {
      setReports([]);
      return;
    }
    setLoading(true);
    const params: Parameters<typeof api.reports>[0] = {};
    if (drillStatus) params.status = drillStatus;
    if (drillWilayah) params.wilayah_id = drillWilayah;
    api
      .reports(params)
      .then((data) => {
        let filtered = data.reports;
        if (drillCategory) {
          filtered = filtered.filter((r) => r.category_id === drillCategory);
        }
        setReports(filtered);
      })
      .catch((e) => { logger.error("Failed to fetch reports", { error: e }); setReports([]); })
      .finally(() => setLoading(false));
  }, [drillStatus, drillCategory, drillWilayah, hasDrillDown]);

  // Computed values
  const totalReports = stats?.total ?? 0;
  const slaBreached = stats?.sla_breached ?? 0;
  const slaAtRisk = stats?.sla_at_risk ?? 0;
  const slaCompliance =
    totalReports > 0 ? Math.round(((totalReports - slaBreached) / totalReports) * 100) : 0;
  const resolvedCount = stats?.by_status.resolved ?? 0;
  const resolutionRate =
    totalReports > 0 ? Math.round((resolvedCount / totalReports) * 100) : 0;

  // Backlog: in-progress statuses
  const backlogStatuses = [
    "submitted",
    "under_review",
    "verified",
    "in_progress",
    "needs_survey",
  ];
  const backlogCount = backlogStatuses.reduce(
    (sum, s) => sum + (stats?.by_status[s] ?? 0),
    0
  );

  // Export handlers
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params: { status?: string; category_id?: string; wilayah_id?: string } = {};
      if (drillStatus) params.status = drillStatus;
      if (drillCategory) params.category_id = drillCategory;
      if (drillWilayah) params.wilayah_id = drillWilayah;
      const csv = await api.exportCsv(params);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exec-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    } catch {
      toast.error("Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const params: { status?: string; category_id?: string; wilayah_id?: string } = {};
      if (drillStatus) params.status = drillStatus;
      if (drillCategory) params.category_id = drillCategory;
      if (drillWilayah) params.wilayah_id = drillWilayah;
      const blob = await api.exportPdf(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exec-export-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exported successfully");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const handleExportGeoJSON = async () => {
    setExporting(true);
    try {
      const params: { status?: string; category_id?: string; wilayah_id?: string } = {};
      if (drillStatus) params.status = drillStatus;
      if (drillCategory) params.category_id = drillCategory;
      if (drillWilayah) params.wilayah_id = drillWilayah;
      const blob = await api.exportGeojson(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exec-export-${new Date().toISOString().slice(0, 10)}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("GeoJSON exported successfully");
    } catch {
      toast.error("Failed to export GeoJSON");
    } finally {
      setExporting(false);
    }
  };

  // Drill-down helpers
  const drillByStatus = (status: string) => {
    setSearchParams({ status });
  };

  const drillByCategory = (category_id: string) => {
    setSearchParams({ category_id });
  };

  const drillByWilayah = (wilayah_id: string) => {
    setSearchParams({ wilayah_id });
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <p className="text-sigap-textMuted">Memuat...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sigap-background">
      {/* Header */}
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              E
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard Eksekutif</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-medium border border-sigap-border rounded-md hover:bg-sigap-border transition-colors disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-medium border border-sigap-border rounded-md hover:bg-sigap-border transition-colors disabled:opacity-50"
            >
              Export PDF
            </button>
            <button
              onClick={handleExportGeoJSON}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-medium border border-sigap-border rounded-md hover:bg-sigap-border transition-colors disabled:opacity-50"
            >
              Export GeoJSON
            </button>
            <Link
              to="/admin"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Kembali
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Drill-down breadcrumb */}
        {hasDrillDown && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-sigap-textMuted">Filter:</span>
            {drillStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sigap-primary/10 text-sigap-primary rounded">
                Status: {statusLabel(drillStatus)}
                <button onClick={clearDrillDown} className="ml-1 hover:underline">
                  ×
                </button>
              </span>
            )}
            {drillCategory && stats?.by_category.find((c) => c.id === drillCategory) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sigap-primary/10 text-sigap-primary rounded">
                Kategori: {stats.by_category.find((c) => c.id === drillCategory)?.name}
                <button onClick={clearDrillDown} className="ml-1 hover:underline">
                  ×
                </button>
              </span>
            )}
            {drillWilayah && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sigap-primary/10 text-sigap-primary rounded">
                Wilayah: {drillWilayah}
                <button onClick={clearDrillDown} className="ml-1 hover:underline">
                  ×
                </button>
              </span>
            )}
            <button
              onClick={clearDrillDown}
              className="text-sigap-textMuted hover:underline ml-2"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => drillByStatus("")}
            className="bg-white rounded-lg p-4 border border-sigap-border text-left hover:border-sigap-primary transition-colors cursor-pointer"
          >
            <p className="text-xs text-sigap-textMuted mb-1">Total Kasus</p>
            <p className="text-2xl font-bold">{totalReports}</p>
            <p className="text-xs text-sigap-textTertiary mt-1">Semua status</p>
          </button>

          <button
            onClick={() => drillByStatus("resolved")}
            className="bg-white rounded-lg p-4 border border-sigap-border text-left hover:border-sigap-selesai transition-colors cursor-pointer"
          >
            <p className="text-xs text-sigap-textMuted mb-1">Tingkat Resolusi</p>
            <p className="text-2xl font-bold text-sigap-selesai">{resolutionRate}%</p>
            <p className="text-xs text-sigap-textTertiary mt-1">
              {resolvedCount} dari {totalReports} kasus
            </p>
          </button>

          <button
            onClick={() => drillByStatus("")}
            className="bg-white rounded-lg p-4 border border-sigap-border text-left hover:border-sigap-primary transition-colors cursor-pointer"
          >
            <p className="text-xs text-sigap-textMuted mb-1">Kepatuhan SLA</p>
            <p className="text-2xl font-bold text-sigap-selesai">{slaCompliance}%</p>
            <p className="text-xs text-sigap-textTertiary mt-1">
              {totalReports - slaBreached} dari {totalReports} tepat waktu
            </p>
          </button>

          <button
            onClick={() => drillByStatus("")}
            className="bg-white rounded-lg p-4 border border-sigap-border text-left hover:border-sigap-perluTindakan transition-colors cursor-pointer"
          >
            <p className="text-xs text-sigap-textMuted mb-1">Backlog</p>
            <p className="text-2xl font-bold text-sigap-perluTindakan">{backlogCount}</p>
            <p className="text-xs text-sigap-textTertiary mt-1">Kasus belum selesai</p>
          </button>
        </div>

        {/* Backlog by Status */}
        <div className="bg-white rounded-lg border border-sigap-border p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3">Backlog per Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {backlogStatuses.map((status) => {
              const count = stats?.by_status[status] ?? 0;
              const isActive = drillStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => drillByStatus(isActive ? "" : status)}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    isActive
                      ? "border-sigap-primary bg-sigap-primary/5"
                      : "border-sigap-border hover:border-sigap-primary"
                  }`}
                >
                  <p className="text-xs text-sigap-textMuted">{statusLabel(status)}</p>
                  <p className="text-xl font-bold mt-1">{count}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* SLA Compliance */}
        <div className="bg-white rounded-lg border border-sigap-border p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3">Kepatuhan SLA</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-sigap-textMuted">Tepat Waktu</span>
                <span className="text-sm font-semibold text-sigap-selesai">
                  {totalReports - slaBreached - slaAtRisk}
                </span>
              </div>
              <div className="h-3 bg-sigap-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-sigap-selesai"
                  style={{
                    width: `${
                      totalReports > 0
                        ? Math.round (((totalReports - slaBreached - slaAtRisk) / totalReports) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-sigap-textMuted">At Risk</span>
                <span className="text-sm font-semibold text-yellow-600">{slaAtRisk}</span>
              </div>
              <div className="h-3 bg-sigap-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-yellow-500"
                  style={{
                    width: `${
                      totalReports > 0 ? Math.round((slaAtRisk / totalReports) * 100) : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-sigap-textMuted">Melanggar SLA</span>
                <span className="text-sm font-semibold text-sigap-perluTindakan">
                  {slaBreached}
                </span>
              </div>
              <div className="h-3 bg-sigap-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-sigap-perluTindakan"
                  style={{
                    width: `${
                      totalReports > 0 ? Math.round((slaBreached / totalReports) * 100) : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Distribution Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* By Category */}
          {stats && stats.by_category.length > 0 && (
            <div className="bg-white rounded-lg border border-sigap-border p-4">
              <h2 className="text-sm font-semibold mb-3">Distribusi per Kategori</h2>
              <div className="space-y-2">
                {stats.by_category.map((cat) => {
                  const percentage =
                    stats.total > 0 ? Math.round((cat.count / stats.total) * 100) : 0;
                  const isActive = drillCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => drillByCategory(isActive ? "" : cat.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        isActive
                          ? "bg-sigap-primary/5 border border-sigap-primary"
                          : "hover:bg-sigap-surface border border-transparent"
                      }`}
                    >
                      <span className="text-sm text-sigap-textSecondary w-32 truncate text-left">
                        {cat.name}
                      </span>
                      <div className="flex-1 h-3 bg-sigap-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: colors.primary,
                          }}
                        />
                      </div>
                      <span className="text-xs text-sigap-textMuted w-16 text-right">
                        {cat.count} ({percentage}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* By Wilayah */}
          {stats && stats.by_wilayah.length > 0 && (
            <div className="bg-white rounded-lg border border-sigap-border p-4">
              <h2 className="text-sm font-semibold mb-3">Distribusi per Wilayah</h2>
              <div className="space-y-2">
                {stats.by_wilayah.map((w) => {
                  const percentage =
                    stats.total > 0 ? Math.round((w.count / stats.total) * 100) : 0;
                  const isActive = drillWilayah === w.wilayah_id;
                  return (
                    <button
                      key={w.wilayah_id}
                      onClick={() => drillByWilayah(isActive ? "" : w.wilayah_id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        isActive
                          ? "bg-sigap-primary/5 border border-sigap-primary"
                          : "hover:bg-sigap-surface border border-transparent"
                      }`}
                    >
                      <span className="text-sm text-sigap-textSecondary w-24 truncate text-left">
                        {wilayahMap[w.wilayah_id] ?? w.wilayah_id}
                      </span>
                      <div className="flex-1 h-3 bg-sigap-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: colors.diproses,
                          }}
                        />
                      </div>
                      <span className="text-xs text-sigap-textMuted w-16 text-right">
                        {w.count} ({percentage}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Drilled-down Report List */}
        {hasDrillDown && (
          <div className="bg-white rounded-lg border border-sigap-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">
                Daftar Kasus
                <span className="ml-2 text-xs text-sigap-textMuted font-normal">
                  ({reports.length} ditemukan)
                </span>
              </h2>
            </div>

            {loading ? (
              <p className="text-center text-sigap-textMuted py-8">Memuat...</p>
            ) : reports.length === 0 ? (
              <p className="text-center text-sigap-textMuted py-8">Tidak ada kasus ditemukan.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((r) => (
                  <Link
                    key={r.id}
                    to={`/admin/cases/${r.id}`}
                    className="bg-sigap-surface rounded-lg p-4 border border-sigap-border hover:border-sigap-primary transition-colors"
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
          </div>
        )}
      </main>
    </div>
  );
};
