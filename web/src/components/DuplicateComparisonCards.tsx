import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Report } from "../types";
import { StatusBadge } from "./StatusBadge";
import { colors } from "../theme/tokens";
import { logger } from "@/lib/logger";

interface DuplicateCandidate {
  report_id: string;
  distance_m: number;
}

interface DuplicateComparisonCardsProps {
  currentReport: Report;
  duplicateCandidates: DuplicateCandidate[];
  onMerge?: (targetReportId: string) => void;
  onKeepSeparate?: (reportId: string) => void;
}

interface ReportWithDistance extends Report {
  distance_m?: number;
}

type ComparisonState = "pending" | "merged" | "separated";

interface ComparisonStatus {
  [reportId: string]: ComparisonState;
}

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatDistance = (meters: number) => {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
};

interface ComparisonCardProps {
  report: ReportWithDistance;
  isCurrentReport?: boolean;
  commonAttributes?: Set<string>;
}

const ComparisonCard = ({ report, isCurrentReport, commonAttributes }: ComparisonCardProps) => {
  const thumbnail = report.photo_urls?.[0];
  const location = report.lat != null && report.lng != null
    ? `${report.lat.toFixed(6)}, ${report.lng.toFixed(6)}`
    : "-";

  return (
    <div className={`flex-1 min-w-0 border rounded-lg p-3 ${
      isCurrentReport ? "border-blue-300 bg-blue-50/30" : "border-gray-200 bg-white"
    }`}>
      {isCurrentReport && (
        <div className="mb-2">
          <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
            Laporan Saat Ini
          </span>
        </div>
      )}

      {thumbnail ? (
        <div className="mb-3">
          <img
            src={thumbnail}
            alt={`Thumbnail for ${report.id.slice(0, 8)}`}
            className="w-full h-32 object-cover rounded border border-gray-200"
          />
        </div>
      ) : (
        <div className="w-full h-32 bg-gray-100 rounded border border-gray-200 mb-3 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Tidak ada foto</span>
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-mono text-gray-500 break-all">{report.id.slice(0, 8)}...</span>
          <StatusBadge status={report.status} />
        </div>

        <div className={`${commonAttributes?.has("category") ? "bg-green-50 px-2 py-1 rounded" : ""}`}>
          <span className="text-xs text-gray-500">Kategori:</span>
          <span className="ml-1 text-gray-700">{report.category?.name ?? report.category_id}</span>
        </div>

        <div className={`${commonAttributes?.has("location") ? "bg-green-50 px-2 py-1 rounded" : ""}`}>
          <span className="text-xs text-gray-500">Lokasi:</span>
          <span className="ml-1 text-gray-700 font-mono text-xs">{location}</span>
        </div>

        <div className={`${commonAttributes?.has("created_at") ? "bg-green-50 px-2 py-1 rounded" : ""}`}>
          <span className="text-xs text-gray-500">Waktu:</span>
          <span className="ml-1 text-gray-700">{formatDate(report.created_at)}</span>
        </div>

        {report.distance_m != null && (
          <div>
            <span className="text-xs text-gray-500">Jarak:</span>
            <span className="ml-1 text-gray-700 font-medium">{formatDistance(report.distance_m)}</span>
          </div>
        )}

        <div className={`${commonAttributes?.has("severity") ? "bg-green-50 px-2 py-1 rounded" : ""}`}>
          <span className="text-xs text-gray-500">Severity:</span>
          <span className="ml-1 text-gray-700">{report.severity != null ? `${report.severity}%` : "-"}</span>
        </div>
      </div>
    </div>
  );
};

export const DuplicateComparisonCards = ({
  currentReport,
  duplicateCandidates,
  onMerge,
  onKeepSeparate,
}: DuplicateComparisonCardsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [candidateReports, setCandidateReports] = useState<Record<string, ReportWithDistance>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const comparisonStates = useMemo(() => {
    const states: ComparisonStatus = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith("cmp_")) {
        const reportId = key.replace("cmp_", "");
        if (value === "merged" || value === "separated" || value === "pending") {
          states[reportId] = value;
        }
      }
    });
    return states;
  }, [searchParams]);

  useEffect(() => {
    if (duplicateCandidates.length === 0) return;

    const results: Record<string, ReportWithDistance> = {};
    const distanceMap = Object.fromEntries(
      duplicateCandidates.map((c) => [c.report_id, c.distance_m])
    );

    const fetchCandidates = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all(
          duplicateCandidates.map(async (candidate) => {
            try {
              const report = await api.report(candidate.report_id);
              const distance = distanceMap[candidate.report_id];
              results[candidate.report_id] = {
                ...report,
                ...(distance != null ? { distance_m: distance } : {}),
              };
            } catch (e) {
              logger.error(`Failed to fetch report ${candidate.report_id}`, { error: e });
            }
          })
        );
        setCandidateReports(results);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch candidate reports");
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [duplicateCandidates]);

  const updateComparisonState = (reportId: string, state: ComparisonState) => {
    const newParams = new URLSearchParams(searchParams);
    if (state === "pending") {
      newParams.delete(`cmp_${reportId}`);
    } else {
      newParams.set(`cmp_${reportId}`, state);
    }
    setSearchParams(newParams, { replace: true });
  };

  const handleMerge = async (targetReportId: string) => {
    setActionLoading(targetReportId);
    try {
      await api.verifikatorCombine(currentReport.id, {
        target_case_id: targetReportId,
        reason: "Merged via duplicate comparison",
      });
      updateComparisonState(targetReportId, "merged");
      onMerge?.(targetReportId);
    } catch (e) {
      logger.error("Failed to merge reports", { error: e });
      setError(e instanceof Error ? e.message : "Failed to merge reports");
    } finally {
      setActionLoading(null);
    }
  };

  const handleKeepSeparate = async (reportId: string) => {
    setActionLoading(reportId);
    try {
      await api.verifikatorSeparate(reportId, {
        new_case_description: `Laporan duplikat - ${currentReport.category?.name ?? currentReport.category_id}`,
        reason: "Disimpan terpisah via perbandingan duplikat",
      });
      updateComparisonState(reportId, "separated");
      onKeepSeparate?.(reportId);
    } catch (e) {
      logger.error("Failed to keep separate", { error: e });
      setError(e instanceof Error ? e.message : "Failed to keep separate");
    } finally {
      setActionLoading(null);
    }
  };

  const findCommonAttributes = (candidate: Report): Set<string> => {
    const common = new Set<string>();
    if (candidate.category_id === currentReport.category_id) common.add("category");
    if (candidate.lat === currentReport.lat && candidate.lng === currentReport.lng) common.add("location");
    if (candidate.created_at === currentReport.created_at) common.add("created_at");
    if (candidate.severity === currentReport.severity) common.add("severity");
    return common;
  };

  if (duplicateCandidates.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-sigap-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.perluTindakan }}
          />
          <h3 className="text-sm font-semibold text-sigap-textPrimary">
            Kandidat Duplikat
          </h3>
        </div>
        <div className="flex gap-2 items-center text-sm text-sigap-textMuted">
          <div className="animate-pulse flex gap-2">
            <div className="h-20 w-32 bg-gray-200 rounded"></div>
            <div className="h-20 w-32 bg-gray-200 rounded"></div>
          </div>
          <span>Memuat kandidat duplikat...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-sigap-border overflow-hidden">
      <div className="px-4 py-3 border-b border-sigap-border bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: colors.perluTindakan }}
            />
            <h3 className="text-sm font-semibold text-sigap-textPrimary">
              Kandidat Duplikat ({duplicateCandidates.length})
            </h3>
          </div>
          <span className="text-xs text-sigap-textMuted">
            Baris hijau = atribut sama
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {duplicateCandidates.map((candidate) => {
          const candidateReport = candidateReports[candidate.report_id];
          const state = comparisonStates[candidate.report_id] ?? "pending";
          const isActioning = actionLoading === candidate.report_id;

          if (!candidateReport) return null;

          const commonAttrs = findCommonAttributes(candidateReport);

          return (
            <div key={candidate.report_id} className="p-4">
              <div className="mb-3">
                <span className="text-xs text-sigap-textMuted">
                  Kandidat #{candidate.report_id.slice(0, 8)}... •{" "}
                  <span className="font-medium text-sigap-textSecondary">
                    {formatDistance(candidate.distance_m)}
                  </span>{" "}
                  dari laporan saat ini
                </span>
              </div>

              <div className="flex gap-4 mb-3">
                <ComparisonCard
                  report={currentReport}
                  isCurrentReport={true}
                  commonAttributes={commonAttrs}
                />
                <ComparisonCard
                  report={candidateReport}
                  isCurrentReport={false}
                  commonAttributes={commonAttrs}
                />
              </div>

              {state === "pending" && (
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => handleKeepSeparate(candidate.report_id)}
                    disabled={isActioning}
                    className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {isActioning ? "Memproses..." : "Simpan Terpisah"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMerge(candidate.report_id)}
                    disabled={isActioning}
                    className="px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  >
                    {isActioning ? "Memproses..." : "Gabungkan"}
                  </button>
                </div>
              )}

              {state === "merged" && (
                <div className="flex items-center justify-end gap-2 text-sm text-green-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Digabungkan</span>
                </div>
              )}

              {state === "separated" && (
                <div className="flex items-center justify-end gap-2 text-sm text-blue-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Disimpan Terpisah</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
