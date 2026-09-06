import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type {
  Report,
  Facility,
  AgentAssessment,
  StoredAgentAssessment,
} from "../types";
import { useAuthStore } from "../stores/auth";
import {
  colors,
  extendedColors,
  assessmentStatusColors,
} from "../theme/tokens";
import { Link } from "react-router-dom";

import { logger } from "@/lib/logger";
import { SigapCard } from "../components/design-system/Card";
import { Skeleton } from "../components/design-system/Skeleton";
import { EmptyState } from "../components/design-system/EmptyState";
import { ErrorRetry } from "../components/design-system/ErrorRetry";
import { toast } from "../components/Toast";
import { VerificationQueueCard } from "../components";

type ReportAssessment = StoredAgentAssessment;

interface ToolStats {
  name: string;
  count: number;
  avgConfidence: number | null;
}

interface FailedAssessment {
  id: string;
  report_id: string;
  tool_name: string;
  error: string;
  failed_at: string;
  retry_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  permanent_dlq: boolean;
}

const AssessmentStatusBadge = ({ status }: { status: string }) => {
  const normalized = status.toLowerCase();
  const statusColorPairs: Record<string, { bg: string; text: string }> = {
    completed: { bg: colors.successBg, text: assessmentStatusColors.completed },
    success: { bg: colors.successBg, text: assessmentStatusColors.completed },
    timeout: { bg: colors.warningBg, text: assessmentStatusColors.timeout },
    parse_failed: { bg: colors.dangerBg, text: assessmentStatusColors.failed },
    vlm_error: { bg: colors.dangerBg, text: assessmentStatusColors.failed },
    failed: { bg: colors.dangerBg, text: assessmentStatusColors.failed },
    error: { bg: colors.dangerBg, text: assessmentStatusColors.error },
  };
  const { bg, text } = statusColorPairs[normalized] ?? {
    bg: colors.bgSurface,
    text: assessmentStatusColors.default,
  };
  const labels: Record<string, string> = {
    running: "Sedang diperiksa",
    pending: "Menunggu pemeriksaan",
    queued: "Dalam antrean",
    partial: "Sebagian selesai",
    completed: "Selesai",
    success: "Selesai",
    timeout: "Melewati batas waktu",
    parse_failed: "Hasil tidak terbaca",
    vlm_error: "Layanan AI bermasalah",
    failed: "Belum berhasil",
    error: "Terjadi kendala",
  };
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {labels[normalized] ?? "Status belum diketahui"}
    </span>
  );
};

type ConsoleTab = "assessments" | "facilities" | "dlq";

export const AIConsole = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ConsoleTab>("assessments");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: colors.textPrimary }}
        >
          Pemantauan pemeriksaan AI
        </h2>
      </div>

      <div
        className="flex gap-1 border-b"
        style={{ borderColor: colors.borderCard }}
      >
        {[
          { id: "assessments" as ConsoleTab, label: "Hasil pemeriksaan" },
          { id: "facilities" as ConsoleTab, label: "Fasilitas" },
          { id: "dlq" as ConsoleTab, label: "Kendala pemeriksaan" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="text-xs font-semibold pb-3 px-5 border-b-2 transition-colors"
            style={{
              color:
                activeTab === tab.id ? colors.primary : colors.textTertiary,
              borderColor:
                activeTab === tab.id ? colors.primary : "transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "assessments" && <AssessmentsTab />}
      {activeTab === "facilities" && <FacilitiesTab />}
      {activeTab === "dlq" && <DLQTab />}
    </div>
  );
};

function AssessmentsTab() {
  const [assessments, setAssessments] = useState<ReportAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchAssessments = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .agentAssessmentsList()
      .then((data) => {
        let items = data.assessments ?? [];
        if (statusFilter) {
          items = items.filter(
            (a) => a.status.toLowerCase() === statusFilter.toLowerCase(),
          );
        }
        if (dateFrom) {
          items = items.filter(
            (a) => new Date(a.created_at) >= new Date(dateFrom),
          );
        }
        if (dateTo) {
          items = items.filter(
            (a) => new Date(a.created_at) <= new Date(dateTo + "T23:59:59"),
          );
        }
        if (confidenceFilter) {
          items = items.filter((a) => {
            if (a.confidence == null) return false;
            const pct = a.confidence * 100;
            if (confidenceFilter === "high") return pct >= 80;
            if (confidenceFilter === "medium") return pct >= 50 && pct < 80;
            if (confidenceFilter === "low") return pct < 50;
            return true;
          });
        }
        items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setAssessments(items);
      })
      .catch((e) => {
        logger.error("Failed to fetch assessments", { error: e });
        setError("Gagal memuat data assessment");
      })
      .finally(() => setLoading(false));
  }, [statusFilter, confidenceFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  const scored = assessments.filter(
    (a) => a.confidence != null && Number.isFinite(a.confidence),
  );
  const stats = {
    total: assessments.length,
    completed: assessments.filter(
      (a) =>
        a.status.toLowerCase() === "completed" ||
        a.status.toLowerCase() === "success",
    ).length,
    failed: assessments.filter((a) =>
      ["timeout", "parse_failed", "vlm_error", "failed", "error"].includes(
        a.status.toLowerCase(),
      ),
    ).length,
    avgConfidence: scored.length
      ? (
          (scored.reduce((sum, a) => sum + (a.confidence ?? 0), 0) /
            scored.length) *
          100
        ).toFixed(1)
      : null,
    failureRate:
      assessments.length > 0
        ? (
            (assessments.filter((a) =>
              [
                "timeout",
                "parse_failed",
                "vlm_error",
                "failed",
                "error",
              ].includes(a.status.toLowerCase()),
            ).length /
              assessments.length) *
            100
          ).toFixed(1)
        : "0.0",
  };

  const toolStats: ToolStats[] = [
    ...new Set(assessments.map((a) => a.tool_name)),
  ].map((name) => {
    const entries = assessments.filter((a) => a.tool_name === name);
    const values = entries
      .map((a) => a.confidence)
      .filter(
        (value): value is number => value != null && Number.isFinite(value),
      );
    return {
      name,
      count: entries.length,
      avgConfidence: values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null,
    };
  });
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: colors.textTertiary }}>
          {assessments.length} assessments
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SigapCard padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Jumlah pemeriksaan
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            {stats.total}
          </p>
        </SigapCard>
        <SigapCard severity="success" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Berhasil
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.selesai }}>
            {stats.completed}
          </p>
        </SigapCard>
        <SigapCard severity="danger" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Gagal
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.danger }}>
            {stats.failed}
          </p>
        </SigapCard>
        <SigapCard severity="primary" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Rata-rata keyakinan hasil
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.primary }}>
            {stats.avgConfidence == null
              ? "Belum tersedia"
              : `${stats.avgConfidence}%`}
          </p>
        </SigapCard>
        <SigapCard severity="warning" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Pemeriksaan yang mengalami kendala
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.warning }}>
            {stats.failureRate}%
          </p>
        </SigapCard>
      </div>

      {toolStats.length > 0 && (
        <SigapCard padding={16}>
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: colors.textPrimary }}
          >
            Pemeriksaan menurut jenis
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {toolStats.map((tool) => (
              <div
                key={tool.name}
                className="flex items-center justify-between"
              >
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: colors.textPrimary }}
                  >
                    {tool.name}
                  </p>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {tool.count} assessments
                  </p>
                </div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: colors.primary }}
                >
                  {tool.avgConfidence == null
                    ? "Belum tersedia"
                    : `${(tool.avgConfidence * 100).toFixed(0)}%`}
                </p>
              </div>
            ))}
          </div>
        </SigapCard>
      )}

      <SigapCard padding={16}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: colors.textTertiary }}
            >
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm"
              style={{
                borderColor: colors.borderCard,
                color: colors.textPrimary,
                backgroundColor: colors.bgSurface,
              }}
            >
              <option value="">Semua</option>
              <option value="completed">Proses selesai</option>
              <option value="timeout">Melewati batas waktu</option>
              <option value="parse_failed">Hasil tidak terbaca</option>
              <option value="vlm_error">Layanan AI bermasalah</option>
              <option value="failed">Proses belum berhasil</option>
              <option value="error">Terjadi kendala</option>
            </select>
          </div>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: colors.textTertiary }}
            >
              Keyakinan hasil
            </label>
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm"
              style={{
                borderColor: colors.borderCard,
                color: colors.textPrimary,
                backgroundColor: colors.bgSurface,
              }}
            >
              <option value="">Semua</option>
              <option value="high">Tinggi (&gt;80%)</option>
              <option value="medium">Sedang (50-80%)</option>
              <option value="low">Rendah (&lt;50%)</option>
            </select>
          </div>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: colors.textTertiary }}
            >
              Dari Tanggal
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm"
              style={{
                borderColor: colors.borderCard,
                color: colors.textPrimary,
                backgroundColor: colors.bgSurface,
              }}
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: colors.textTertiary }}
            >
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm"
              style={{
                borderColor: colors.borderCard,
                color: colors.textPrimary,
                backgroundColor: colors.bgSurface,
              }}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStatusFilter("");
                setConfidenceFilter("");
                setDateFrom("");
                setDateTo("");
              }}
              className="px-4 py-1.5 rounded border text-sm transition-colors"
              style={{
                borderColor: colors.borderCard,
                color: colors.textTertiary,
              }}
            >
              Hapus filter
            </button>
          </div>
        </div>
      </SigapCard>

      {loading ? (
        <SigapCard padding={16}>
          <Skeleton loading height={200} />
        </SigapCard>
      ) : error ? (
        <SigapCard padding={16}>
          <ErrorRetry error={error} onRetry={fetchAssessments} />
        </SigapCard>
      ) : assessments.length === 0 ? (
        <SigapCard padding={16}>
          <EmptyState
            icon={<span style={{ fontSize: 48 }}>🔍</span>}
            title="Tidak ada hasil pemeriksaan"
            subtitle="Pilih cakupan lain atau jalankan pemeriksaan dari laporan yang ingin ditinjau."
          />
        </SigapCard>
      ) : (
        <SigapCard padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    backgroundColor: extendedColors.bgScreen,
                    borderColor: colors.borderCard,
                  }}
                >
                  <th
                    className="text-left px-3 py-2 font-medium text-xs"
                    style={{ color: colors.textTertiary }}
                  >
                    Waktu pemeriksaan
                  </th>
                  <th
                    className="text-left px-3 py-2 font-medium text-xs"
                    style={{ color: colors.textTertiary }}
                  >
                    Nomor laporan
                  </th>
                  <th
                    className="text-left px-3 py-2 font-medium text-xs"
                    style={{ color: colors.textTertiary }}
                  >
                    Status
                  </th>
                  <th
                    className="text-right px-3 py-2 font-medium text-xs"
                    style={{ color: colors.textTertiary }}
                  >
                    Keyakinan hasil
                  </th>
                  <th
                    className="text-left px-3 py-2 font-medium text-xs"
                    style={{ color: colors.textTertiary }}
                  >
                    Tool
                  </th>
                  <th
                    className="text-left px-3 py-2 font-medium text-xs"
                    style={{ color: colors.textTertiary }}
                  >
                    Model
                  </th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b"
                    style={{ borderColor: colors.borderCard }}
                  >
                    <td
                      className="px-3 py-2 text-xs whitespace-nowrap"
                      style={{ color: colors.textTertiary }}
                    >
                      {new Date(a.created_at).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <Link
                        to={`/system/cases/${a.report_id}`}
                        className="hover:underline font-mono text-xs"
                        style={{ color: colors.primary }}
                      >
                        {a.report_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <AssessmentStatusBadge status={a.status} />
                    </td>
                    <td
                      className="px-3 py-2 text-sm text-right"
                      style={{ color: colors.textPrimary }}
                    >
                      {a.confidence == null
                        ? "Belum tersedia"
                        : `${(a.confidence * 100).toFixed(0)}%`}
                    </td>
                    <td
                      className="px-3 py-2 text-sm"
                      style={{ color: colors.textPrimary }}
                    >
                      {a.tool_name}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      {a.agent_version ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SigapCard>
      )}
    </>
  );
}

function FacilitiesTab() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityAssessments, setFacilityAssessments] = useState<
    Record<string, AgentAssessment[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchFacilities = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .facilities({ page, limit })
      .then(async (data) => {
        const facs = data.data ?? [];
        setFacilities(facs);
        setTotal(data.pagination?.total ?? 0);

        const assessmentMap: Record<string, AgentAssessment[]> = {};
        await Promise.allSettled(
          facs.map(async (f) => {
            try {
              const res = await api.reportAssessments(f.primary_report_id);
              assessmentMap[f.id] = (res.assessments ??
                []) as unknown as AgentAssessment[];
            } catch {
              assessmentMap[f.id] = [];
            }
          }),
        );
        setFacilityAssessments(assessmentMap);
      })
      .catch((e) => {
        logger.error("Failed to fetch facilities", { error: e });
        setError("Gagal memuat data fasilitas");
      })
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  const handleFacilityAction = useCallback(
    (action: string, facilityId: string) => {
      toast.info(
        `Aksi "${action}" untuk fasilitas ${facilityId.slice(0, 8)}... akan segera tersedia`,
      );
    },
    [],
  );

  return (
    <>
      <p className="text-sm" style={{ color: colors.textTertiary }}>
        {total} fasilitas tercatat
      </p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} loading height={160} />
          ))}
        </div>
      ) : error ? (
        <ErrorRetry error={error} onRetry={fetchFacilities} />
      ) : facilities.length === 0 ? (
        <EmptyState
          icon={<span style={{ fontSize: 48 }}>🏗️</span>}
          title="Tidak ada fasilitas"
          subtitle="Belum ada fasilitas yang tercatat di sistem."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {facilities.map((f) => (
              <VerificationQueueCard
                key={f.id}
                facility={f}
                assessments={facilityAssessments[f.id] ?? []}
                onAction={handleFacilityAction}
              />
            ))}
          </div>
          {total > limit && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                style={{
                  borderColor: colors.borderCard,
                  color: colors.textPrimary,
                }}
              >
                Prev
              </button>
              <span className="text-sm" style={{ color: colors.textTertiary }}>
                Halaman {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * limit >= total}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                style={{
                  borderColor: colors.borderCard,
                  color: colors.textPrimary,
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function DLQTab() {
  const [failed, setFailed] = useState<FailedAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const limit = 20;

  const fetchFailed = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAdminFailedAssessments({ page, limit })
      .then((data) => {
        setFailed(data.data ?? []);
        setTotal(data.pagination?.total ?? 0);
      })
      .catch((e) => {
        logger.error("Failed to fetch failed assessments", { error: e });
        setError(
          "Aplikasi belum dapat memuat pemeriksaan yang mengalami kendala. Coba muat ulang daftar.",
        );
      })
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    fetchFailed();
  }, [fetchFailed]);

  const handleRetryOne = async (id: string) => {
    setRetryingIds((prev) => new Set(prev).add(id));
    try {
      const res = await api.retryBatchAssessments([id]);
      const result = res.results?.[0];
      if (result?.success) {
        toast.success(
          `Percobaan ulang berhasil untuk laporan ${id.slice(0, 8)}`,
        );
      } else {
        toast.error(
          `Percobaan ulang belum berhasil: ${result?.error ?? "Layanan belum memberikan rincian kendala"}`,
        );
      }
      fetchFailed();
    } catch (e) {
      toast.error(
        `Percobaan ulang belum berhasil: ${e instanceof Error ? e.message : "Layanan belum memberikan rincian kendala"}`,
      );
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRetryAll = async () => {
    const ids = failed.filter((f) => !f.permanent_dlq).map((f) => f.id);
    if (ids.length === 0) return;
    setRetryingIds(new Set(ids));
    try {
      const res = await api.retryBatchAssessments(ids);
      const succeeded = res.results?.filter((r) => r.success).length ?? 0;
      const failedCount = res.results?.filter((r) => !r.success).length ?? 0;
      toast.success(
        `Percobaan ulang selesai: ${succeeded} berhasil, ${failedCount} gagal`,
      );
      fetchFailed();
    } catch (e) {
      toast.error(
        `Aplikasi belum dapat mengulang pemeriksaan: ${e instanceof Error ? e.message : "Layanan belum memberikan rincian kendala"}`,
      );
    } finally {
      setRetryingIds(new Set());
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: colors.textTertiary }}>
          {total} pemeriksaan mengalami kendala
        </p>
        {failed.length > 0 && (
          <button
            onClick={handleRetryAll}
            disabled={retryingIds.size > 0}
            className="text-xs px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50"
            style={{ backgroundColor: colors.primary, color: "#fff" }}
          >
            {retryingIds.size > 0
              ? "Memproses..."
              : "Coba ulang semua pada halaman ini"}
          </button>
        )}
      </div>

      {loading ? (
        <SigapCard padding={16}>
          <Skeleton loading height={200} />
        </SigapCard>
      ) : error ? (
        <SigapCard padding={16}>
          <ErrorRetry error={error} onRetry={fetchFailed} />
        </SigapCard>
      ) : failed.length === 0 ? (
        <SigapCard padding={16}>
          <EmptyState
            icon={<span style={{ fontSize: 48 }}>✅</span>}
            title="Tidak ada kendala pada cakupan ini"
            subtitle="Daftar ini tidak memuat pemeriksaan yang memerlukan percobaan ulang. Hal ini tidak menentukan apakah isi laporan benar atau lengkap."
          />
        </SigapCard>
      ) : (
        <>
          <SigapCard padding={0}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      backgroundColor: extendedColors.bgScreen,
                      borderColor: colors.borderCard,
                    }}
                  >
                    <th
                      className="text-left px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Nomor laporan
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Tool
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Error
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Jumlah percobaan ulang
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Waktu kendala
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Status
                    </th>
                    <th
                      className="text-right px-3 py-2 font-medium text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b"
                      style={{ borderColor: colors.borderCard }}
                    >
                      <td className="px-3 py-2">
                        <Link
                          to={`/system/cases/${f.report_id}`}
                          className="hover:underline font-mono text-xs"
                          style={{ color: colors.primary }}
                        >
                          {f.report_id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td
                        className="px-3 py-2 text-sm"
                        style={{ color: colors.textPrimary }}
                      >
                        {f.tool_name}
                      </td>
                      <td
                        className="px-3 py-2 text-xs max-w-[200px] truncate"
                        style={{ color: colors.danger }}
                      >
                        {f.error}
                      </td>
                      <td
                        className="px-3 py-2 text-sm"
                        style={{ color: colors.textPrimary }}
                      >
                        {f.retry_count}
                      </td>
                      <td
                        className="px-3 py-2 text-xs whitespace-nowrap"
                        style={{ color: colors.textTertiary }}
                      >
                        {new Date(f.failed_at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        {f.permanent_dlq ? (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: colors.dangerBg,
                              color: colors.danger,
                            }}
                          >
                            Perlu pemeriksaan layanan
                          </span>
                        ) : (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: colors.warningBg,
                              color: colors.warning,
                            }}
                          >
                            Dapat dicoba kembali
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!f.permanent_dlq && (
                          <button
                            onClick={() => handleRetryOne(f.id)}
                            disabled={retryingIds.has(f.id)}
                            className="text-xs font-semibold px-3 py-1 rounded transition-colors disabled:opacity-50"
                            style={{
                              backgroundColor: colors.primaryLight,
                              color: colors.primaryDark,
                            }}
                          >
                            {retryingIds.has(f.id) ? "..." : "Coba ulang"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SigapCard>
          {total > limit && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                style={{
                  borderColor: colors.borderCard,
                  color: colors.textPrimary,
                }}
              >
                Prev
              </button>
              <span className="text-sm" style={{ color: colors.textTertiary }}>
                Halaman {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * limit >= total}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                style={{
                  borderColor: colors.borderCard,
                  color: colors.textPrimary,
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
