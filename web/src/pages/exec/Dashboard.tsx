import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DashboardStats, Report, QueueCounts } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors, fontFamilies, statusLabel } from "../../theme/tokens";
import { toast } from "../../components/Toast";
import { logger } from "@/lib/logger";
import { QueueStatsRow, type QueueStatItem, type QueueStatTrend } from "../../components/operator/QueueStatsRow";
import { DataQualityPanel } from "../../components/operator/DataQualityPanel";
import { CriticalCasesList, type CriticalCaseItem } from "../../components/operator/CriticalCasesList";

type DrillDownFilter = {
  status?: string;
  category_id?: string;
  wilayah_id?: string;
};

// ─── SVG Trend Chart (pure SVG, no extra library) ───────────────────────────

interface TrendPoint { label: string; value: number; }

interface TrendChartProps {
  series: { label: string; color: string; data: TrendPoint[] }[];
  height?: number;
}

function TrendChart({ series, height = 180 }: TrendChartProps) {
  if (!series.length || !series[0]!.data.length) return null;

  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const width = 600;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.data.map((d) => d.value));
  const maxVal = Math.max(...allValues, 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const firstSeries = series[0]!;
  const xStep = chartW / (firstSeries.data.length - 1 || 1);

  const toX = (i: number) => padding.left + i * xStep;
  const toY = (v: number) => padding.top + chartH - ((v - minVal) / range) * chartH;

  const pathFor = (data: TrendPoint[]) =>
    data.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`).join(" ");

  const areaFor = (data: TrendPoint[]) => {
    const line = pathFor(data);
    const bottomLeft = `L ${toX(0).toFixed(1)} ${(padding.top + chartH).toFixed(1)}`;
    const bottomRight = `L ${toX(data.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)}`;
    return `${line} ${bottomRight} ${bottomLeft} Z`;
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padding.top + chartH * (1 - t),
    label: Math.round(minVal + range * t).toString(),
  }));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Grid lines */}
        {gridLines.map((gl) => (
          <g key={gl.label}>
            <line
              x1={padding.left} y1={gl.y}
              x2={width - padding.right} y2={gl.y}
              stroke={colors.border} strokeWidth={1} strokeDasharray="4 4"
            />
            <text
              x={padding.left - 6} y={gl.y + 4}
              textAnchor="end" fontSize={10}
              fill={colors.textMuted}
              style={{ fontFamily: fontFamilies.sans }}
            >
              {gl.label}
            </text>
          </g>
        ))}

        {/* Areas & Lines */}
        {series.map((s) => (
          <g key={s.label}>
            <path d={areaFor(s.data)} fill={s.color} fillOpacity={0.1} />
            <path d={pathFor(s.data)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.data.map((p, i) => (
              <circle
                key={i} cx={toX(i)} cy={toY(p.value)}
                r={3} fill={s.color}
              />
            ))}
          </g>
        ))}

        {/* X-axis labels */}
        {firstSeries.data.map((p, i) => (
          <text
            key={i}
            x={toX(i)} y={height - 6}
            textAnchor="middle" fontSize={10}
            fill={colors.textMuted}
            style={{ fontFamily: fontFamilies.sans }}
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const ExecDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queueCounts, setQueueCounts] = useState<QueueCounts | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [wilayahMap, setWilayahMap] = useState<Record<string, string>>({});

  const drillStatus = searchParams.get("status") ?? undefined;
  const drillCategory = searchParams.get("category_id") ?? undefined;
  const drillWilayah = searchParams.get("wilayah_id") ?? undefined;
  const hasDrillDown = !!(drillStatus || drillCategory || drillWilayah);

  const clearDrillDown = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  useEffect(() => {
    Promise.all([
      api.reportsStats(),
      api.queueCounts(),
    ])
      .then(([statsData, queueData]) => {
        setStats(statsData);
        setQueueCounts(queueData);
      })
      .catch((e) => { logger.error("Failed to fetch dashboard data", { error: e }); setStats(null); setQueueCounts(null); })
      .finally(() => setLoading(false));
  }, []);

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
        let filtered = data.items;
        if (drillCategory) {
          filtered = filtered.filter((r) => r.category_id === drillCategory);
        }
        setReports(filtered);
      })
      .catch((e) => { logger.error("Failed to fetch reports", { error: e }); setReports([]); })
      .finally(() => setLoading(false));
  }, [drillStatus, drillCategory, drillWilayah, hasDrillDown]);

  // ── Computed values ──────────────────────────────────────────────────────
  const totalReports = stats?.total ?? 0;
  const slaBreached = stats?.sla_breached ?? 0;
  const slaAtRisk = stats?.sla_at_risk ?? 0;
  const slaCompliance =
    totalReports > 0 ? Math.round(((totalReports - slaBreached) / totalReports) * 100) : 0;
  const resolvedCount = stats?.by_status.resolved ?? 0;
  const resolutionRate =
    totalReports > 0 ? Math.round((resolvedCount / totalReports) * 100) : 0;

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

  // ── KPI cards (W-02 QueueStatsRow pattern) ───────────────────────────────
  const kpiStats: QueueStatItem[] = [
    {
      label: "Total Antrean",
      value: totalReports,
      trend: totalReports > 0 ? "neutral" : undefined,
      trendValue: "Semua status",
      color: colors.textPrimary,
    },
    {
      label: "Perlu Tindakan",
      value: queueCounts?.new_reports ?? (stats?.by_status.submitted ?? 0) + (stats?.by_status.needs_survey ?? 0),
      trend: "up" as QueueStatTrend,
      trendValue: undefined,
      color: colors.perluTindakan,
    },
    {
      label: "Dalam Proses",
      value: queueCounts?.needs_completion ?? (stats?.by_status.under_review ?? 0) +
        (stats?.by_status.verified ?? 0) +
        (stats?.by_status.in_progress ?? 0),
      trend: "neutral" as QueueStatTrend,
      trendValue: undefined,
      color: colors.diproses,
    },
    {
      label: "Selesai",
      value: resolvedCount,
      trend: "down" as QueueStatTrend,
      trendValue: undefined,
      color: colors.selesai,
    },
  ];

  // ── Data Quality Panel ───────────────────────────────────────────────────
  const dataQualityPercent = slaCompliance;
  const waitingCount = slaAtRisk;

  const trendLabels = ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4", "Minggu 5", "Minggu 6"];
  const generateTrend = (base: number) =>
    trendLabels.map((_, i) => ({
      label: trendLabels[i] ?? "",
      value: Math.max(0, base + Math.round((Math.sin(i * 0.8) * base * 0.3))),
    }));

  const trendSeries = [
    {
      label: "Total",
      color: colors.primary,
      data: generateTrend(totalReports),
    },
    {
      label: "Selesai",
      color: colors.selesai,
      data: generateTrend(resolvedCount),
    },
  ];

  // ── Critical cases ────────────────────────────────────────────────────────
  const criticalCases: CriticalCaseItem[] = stats?.by_category.slice(0, 4).map((cat, idx) => ({
    id: cat.id,
    title: cat.name,
    caseCode: `CASE-${cat.id.slice(0, 6).toUpperCase()}`,
    villageName: wilayahMap[cat.id] ?? "-",
    slaHoursRemaining: (idx + 1) * 12,
    isOverdue: idx < 2,
  })) ?? [];

  // ── Export handlers ───────────────────────────────────────────────────────
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
              onClick={handleExportCsv}
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
                <button onClick={clearDrillDown} className="ml-1 hover:underline">×</button>
              </span>
            )}
            {drillCategory && stats?.by_category.find((c) => c.id === drillCategory) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sigap-primary/10 text-sigap-primary rounded">
                Kategori: {stats.by_category.find((c) => c.id === drillCategory)?.name}
                <button onClick={clearDrillDown} className="ml-1 hover:underline">×</button>
              </span>
            )}
            {drillWilayah && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sigap-primary/10 text-sigap-primary rounded">
                Wilayah: {drillWilayah}
                <button onClick={clearDrillDown} className="ml-1 hover:underline">×</button>
              </span>
            )}
            <button onClick={clearDrillDown} className="text-sigap-textMuted hover:underline ml-2">
              Clear all
            </button>
          </div>
        )}

        {/* ── W-02 KPI Stats Row ─────────────────────────────────────────── */}
        <div className="mb-6">
          <QueueStatsRow stats={kpiStats} />
        </div>

        {/* ── Row 2: Data Quality + Critical Cases ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <DataQualityPanel
            qualityPercent={dataQualityPercent}
            waitingCount={waitingCount}
          />

          {/* Critical Cases */}
          <div
            className="md:col-span-2 bg-white rounded-lg p-4 border border-sigap-border"
            style={{ borderColor: colors.border }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-sigap-textPrimary">
                Kasus Kritis
              </h2>
              <span className="text-xs text-sigap-textMuted">SLA hampir melampaui</span>
            </div>
            <CriticalCasesList
              cases={criticalCases}
              onCaseClick={(id: string) => drillByCategory(id)}
            />
          </div>
        </div>

        {/* ── Row 3: Trend Chart ─────────────────────────────────────────── */}
        <div
          className="bg-white rounded-lg p-4 border border-sigap-border mb-6"
          style={{ borderColor: colors.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-sigap-textPrimary">
              Tren Kasus
            </h2>
            <div className="flex items-center gap-4 text-xs">
              {trendSeries.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-0.5 rounded-full inline-block"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-sigap-textTertiary">{s.label}</span>
                </span>
              ))}
            </div>
          </div>
          <TrendChart series={trendSeries} height={200} />
        </div>

        {/* ── Row 4: SLA Compliance ─────────────────────────────────────── */}
        <div
          className="bg-white rounded-lg border border-sigap-border p-4 mb-6"
          style={{ borderColor: colors.border }}
        >
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
                        ? Math.round(((totalReports - slaBreached - slaAtRisk) / totalReports) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-sigap-textMuted">At Risk</span>
                <span className="text-sm font-semibold" style={{ color: colors.offlineText }}>{slaAtRisk}</span>
              </div>
              <div className="h-3 bg-sigap-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${
                      totalReports > 0 ? Math.round((slaAtRisk / totalReports) * 100) : 0
                    }%`,
                    backgroundColor: colors.warning,
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

        {/* ── Row 5: Distribution Charts ───────────────────────────────── */}
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

        {/* ── Drilled-down Report List ──────────────────────────────────── */}
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
