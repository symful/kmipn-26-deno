import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Report } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors, statusColors, extendedColors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import { MapView } from "../../components/MapView";
import { logger } from "@/lib/logger";

interface ReportAssessment {
  id: string;
  tool_name: string;
  model_version: string;
  rule_version: string;
  confidence: number;
  supporting_factors: string[];
  risk_factors: string[];
  correlation_ids: string[];
  status: string;
  result: Record<string, unknown>;
  created_at: string;
}

interface AssessmentWithReport {
  assessment: ReportAssessment;
  report: Report;
}

interface ToolStats {
  name: string;
  count: number;
  avgConfidence: number;
}

const AssessmentStatusBadge = ({ status }: { status: string }) => {
  const normalized = status.toLowerCase();
  const statusStyles: Record<string, { bg: string; text: string }> = {
    completed: { bg: "#dcfce7", text: "#166534" },
    success: { bg: "#dcfce7", text: "#166534" },
    timeout: { bg: "#fef9c3", text: "#854d0e" },
    parse_failed: { bg: "#fee2e2", text: "#991b1b" },
    vlm_error: { bg: "#fee2e2", text: "#991b1b" },
    failed: { bg: "#fee2e2", text: "#991b1b" },
    error: { bg: "#fee2e2", text: "#991b1b" },
  };
  const { bg, text } = statusStyles[normalized] ?? { bg: "#f3f4f6", text: "#374151" };
  const labels: Record<string, string> = {
    completed: "Completed",
    success: "Success",
    timeout: "Timeout",
    parse_failed: "Parse Failed",
    vlm_error: "VLM Error",
    failed: "Failed",
    error: "Error",
  };
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {labels[normalized] ?? status}
    </span>
  );
};

const AssessmentRow = ({ item }: { item: AssessmentWithReport }) => {
  const { assessment, report } = item;
  return (
    <tr className="border-b border-sigap-border hover:bg-sigap-background">
      <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
        {new Date(assessment.created_at).toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="px-3 py-2 text-sm">
        <Link
          to={`/admin/cases/${report.id}`}
          className="text-sigap-primary hover:underline font-mono text-xs"
        >
          {report.id.slice(0, 8)}...
        </Link>
      </td>
      <td className="px-3 py-2 text-sm">
        {report.category?.name ?? report.category_id}
      </td>
      <td className="px-3 py-2">
        <AssessmentStatusBadge status={assessment.status} />
      </td>
      <td className="px-3 py-2 text-sm text-right">
        {(assessment.confidence * 100).toFixed(0)}%
      </td>
      <td className="px-3 py-2 text-sm">
        {assessment.tool_name}
      </td>
      <td className="px-3 py-2 text-xs text-sigap-textMuted">
        {assessment.model_version ?? "—"}
      </td>
    </tr>
  );
};

export const OperatorAIConsole = () => {
  const [assessments, setAssessments] = useState<AssessmentWithReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showMap, setShowMap] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params: { status?: string; page: number; limit: number } = { page, limit };
    if (statusFilter) params.status = statusFilter;

    api
      .reports(params)
      .then(async (data) => {
        const items: AssessmentWithReport[] = [];
        const assessmentPromises = data.items.map(async (report) => {
          try {
            const res = await api.reportAssessments(report.id);
            if (res.assessments && res.assessments.length > 0) {
              const sorted = res.assessments.sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              );
              const latest = sorted[0];
              if (!latest) return;

              // Apply filters
              if (dateFrom && new Date(latest.created_at) < new Date(dateFrom)) return;
              if (dateTo && new Date(latest.created_at) > new Date(dateTo + "T23:59:59")) return;
              if (confidenceFilter) {
                const confPercent = (latest.confidence ?? 0) * 100;
                if (confidenceFilter === "high" && confPercent < 80) return;
                if (confidenceFilter === "medium" && (confPercent < 50 || confPercent >= 80)) return;
                if (confidenceFilter === "low" && confPercent >= 50) return;
              }

              items.push({
                assessment: latest,
                report,
              });
            }
          } catch {
            // Skip reports without accessible assessments
          }
        });
        await Promise.all(assessmentPromises);
        items.sort(
          (a, b) =>
            new Date(b.assessment.created_at).getTime() -
            new Date(a.assessment.created_at).getTime()
        );
        setAssessments(items);
        setTotal(data.pagination.total);
      })
      .catch((e) => { logger.error("Failed to fetch assessments", { error: e }); setError("Gagal memuat data assessment"); })
      .finally(() => setLoading(false));
  }, [page, limit, statusFilter, confidenceFilter, dateFrom, dateTo]);

  const handleFilterChange = (key: string, value: string) => {
    if (key === "status") setStatusFilter(value);
    if (key === "confidence") setConfidenceFilter(value);
    if (key === "dateFrom") setDateFrom(value);
    if (key === "dateTo") setDateTo(value);
    setPage(1);
  };

  const stats = {
    total: assessments.length,
    completed: assessments.filter(
      (a) => a.assessment.status.toLowerCase() === "completed" || a.assessment.status.toLowerCase() === "success"
    ).length,
    failed: assessments.filter(
      (a) =>
        a.assessment.status.toLowerCase() === "timeout" ||
        a.assessment.status.toLowerCase() === "parse_failed" ||
        a.assessment.status.toLowerCase() === "vlm_error" ||
        a.assessment.status.toLowerCase() === "failed" ||
        a.assessment.status.toLowerCase() === "error"
    ).length,
    avgConfidence:
      assessments.length > 0
        ? (
            assessments.reduce((sum, a) => sum + a.assessment.confidence, 0) /
            assessments.length *
            100
          ).toFixed(1)
        : "—",
    failureRate:
      assessments.length > 0
        ? ((assessments.filter(
            (a) =>
              a.assessment.status.toLowerCase() === "timeout" ||
              a.assessment.status.toLowerCase() === "parse_failed" ||
              a.assessment.status.toLowerCase() === "vlm_error" ||
              a.assessment.status.toLowerCase() === "failed" ||
              a.assessment.status.toLowerCase() === "error"
          ).length /
            assessments.length) *
          100).toFixed(1)
        : "0.0",
  };

  // Compute tool breakdown
  const toolStats: ToolStats[] = assessments.reduce((acc, item) => {
    const toolName = item.assessment.tool_name || "unknown";
    const existing = acc.find((t) => t.name === toolName);
    if (existing) {
      existing.count++;
      existing.avgConfidence =
        (existing.avgConfidence * (existing.count - 1) + item.assessment.confidence) / existing.count;
    } else {
      acc.push({
        name: toolName,
        count: 1,
        avgConfidence: item.assessment.confidence,
      });
    }
    return acc;
  }, [] as ToolStats[]);

  // Reports for heatmap (using confidence as intensity)
  const reportsForHeatmap: Report[] = assessments
    .filter((a) => a.report.lat != null && a.report.lng != null)
    .map((a) => ({
      ...a.report,
      severity: a.assessment.confidence * 100,
    }));

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              AI
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard Operator</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/operator"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Beranda
            </Link>
            <button
              onClick={() => useAuthStore.getState().clear()}
              className="text-sm text-sigap-perluTindakan hover:underline"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">AI Assessment Console</h2>
            <p className="text-sm text-sigap-textMuted">{total} laporan</p>
          </div>
          <button
            onClick={() => setShowMap(!showMap)}
            className="text-sm px-4 py-2 rounded border border-sigap-border hover:bg-sigap-surface transition-colors"
          >
            {showMap ? "Sembunyikan Peta" : "Tampilkan Peta Confidence"}
          </button>
        </div>

        {showMap && reportsForHeatmap.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2">Confidence Heatmap</h3>
            <div className="rounded-lg overflow-hidden border border-sigap-border">
              <MapView
                reports={reportsForHeatmap}
                height="400px"
                mode="heatmap"
                heatmapConfig={{
                  radius: 30,
                  blur: 20,
                  maxZoom: 18,
                }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
            <p className="text-xs text-sigap-textMuted mb-1">Total Assessments</p>
            <p className="text-2xl font-bold text-sigap-textPrimary">{stats.total}</p>
          </div>
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
            <p className="text-xs text-sigap-textMuted mb-1">Berhasil</p>
            <p className="text-2xl font-bold" style={{ color: colors.selesai }}>{stats.completed}</p>
          </div>
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
            <p className="text-xs text-sigap-textMuted mb-1">Gagal</p>
            <p className="text-2xl font-bold" style={{ color: colors.danger }}>{stats.failed}</p>
          </div>
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
            <p className="text-xs text-sigap-textMuted mb-1">Rata-rata Confidence</p>
            <p className="text-2xl font-bold text-sigap-primary">{stats.avgConfidence}%</p>
          </div>
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
            <p className="text-xs text-sigap-textMuted mb-1">Failure Rate</p>
            <p className="text-2xl font-bold" style={{ color: colors.warning }}>{stats.failureRate}%</p>
          </div>
        </div>

        {toolStats.length > 0 && (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3">Tool Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {toolStats.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-sigap-textPrimary">{tool.name}</p>
                    <p className="text-xs text-sigap-textMuted">{tool.count} assessments</p>
                  </div>
                  <p className="text-sm font-semibold text-sigap-primary">
                    {(tool.avgConfidence * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="">Semua</option>
                <option value="completed">Completed</option>
                <option value="timeout">Timeout</option>
                <option value="parse_failed">Parse Failed</option>
                <option value="vlm_error">VLM Error</option>
                <option value="failed">Failed</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Confidence</label>
              <select
                value={confidenceFilter}
                onChange={(e) => handleFilterChange("confidence", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="">Semua</option>
                <option value="high">Tinggi ({">"}80%)</option>
                <option value="medium">Sedang (50-80%)</option>
                <option value="low">Rendah {"<"}50%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setConfidenceFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                className="px-4 py-1.5 rounded border border-sigap-border text-sm hover:bg-sigap-border transition-colors"
              >
                Reset Filter
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
        ) : error ? (
          <div
            className="p-4 rounded text-sm"
            style={{ backgroundColor: colors.dangerBg, borderColor: extendedColors.dangerBorder, color: colors.danger, borderWidth: "1px", borderStyle: "solid" }}
          >
            {error}
          </div>
        ) : assessments.length === 0 ? (
          <p className="text-center text-sigap-textMuted py-8">
            Tidak ada data assessment.
          </p>
        ) : (
          <>
            <div className="bg-sigap-surface rounded-lg border border-sigap-border overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-sigap-background border-b border-sigap-border">
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Timestamp</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Report ID</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Kategori</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Status</th>
                    <th className="text-right px-3 py-2 font-medium text-sigap-textMuted">Confidence</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Tool</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((item) => (
                    <AssessmentRow key={item.assessment.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>

            {total > limit && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                >
                  Prev
                </button>
                <span className="text-sm text-sigap-textMuted">
                  Halaman {page}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * limit >= total}
                  className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};