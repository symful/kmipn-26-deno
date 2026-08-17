import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Report, ReportStatus } from "../../types";
import { StatusFilter } from "../../components/StatusFilter";
import { StatusBadge } from "../../components/StatusBadge";
import {
  PriorityFilter,
  UnitFilter,
  SLAFilter,
} from "../../components/CaseFilters";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import type { PriorityBucket, SLABucket } from "../../components/CaseFilters";
import { logger } from "@/lib/logger";

interface MergeSplitModal {
  type: "merge" | "split";
  reportId: string;
}

export const AdminDaerahCaseList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "">("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const user = useAuthStore((s) => s.user);

  // Merge/Split modal state
  const [modal, setModal] = useState<MergeSplitModal | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [splitDescription, setSplitDescription] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const selectedPriority = (searchParams.get("priority") ?? "") as PriorityBucket;
  const selectedUnit = searchParams.get("unit") ?? "";
  const selectedSLA = (searchParams.get("sla") ?? "") as SLABucket;

  useEffect(() => {
    setLoading(true);
    const params: {
      status?: string;
      page: number;
      limit: number;
      wilayah_id: string;
      priority?: string;
      assigned_unit_id?: string;
      sla?: string;
    } = { page, limit, wilayah_id: user?.wilayah_id ?? "" };
    if (statusFilter !== "") params.status = statusFilter;
    if (selectedPriority) params.priority = selectedPriority;
    if (selectedUnit) params.assigned_unit_id = selectedUnit;
    if (selectedSLA) params.sla = selectedSLA;
    api
      .reports(params)
      .then((data) => {
        setReports(data.items);
        setTotal(data.pagination.total);
      })
      .catch((e) => { logger.error("Failed to fetch reports", { error: e }); setReports([]); })
      .finally(() => setLoading(false));
  }, [statusFilter, page, limit, selectedPriority, selectedUnit, selectedSLA, user?.wilayah_id]);

  const handleExportCsv = async () => {
    try {
      const params: { status?: string; wilayah_id: string } = { wilayah_id: user?.wilayah_id ?? "" };
      if (statusFilter) params.status = statusFilter;
      const csv = await api.exportCsv(params);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reports-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error("Failed to export CSV", { error: e });
    }
  };

  const handleMerge = async () => {
    if (!modal || !mergeTargetId.trim()) return;
    setActionLoading(true);
    setActionError("");
    try {
      const body: { target_case_id: string; reason?: string } = {
        target_case_id: mergeTargetId.trim(),
      };
      if (actionReason.trim()) body.reason = actionReason.trim();
      await api.verifikatorCombine(modal.reportId, body);
      setModal(null);
      setMergeTargetId("");
      setActionReason("");
      setPage(1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSplit = async () => {
    if (!modal || !splitDescription.trim() || splitDescription.trim().length < 10) return;
    setActionLoading(true);
    setActionError("");
    try {
      const body: { new_case_description: string; reason?: string } = {
        new_case_description: splitDescription.trim(),
      };
      if (actionReason.trim()) body.reason = actionReason.trim();
      await api.verifikatorSeparate(modal.reportId, body);
      setModal(null);
      setSplitDescription("");
      setActionReason("");
      setPage(1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Split failed");
    } finally {
      setActionLoading(false);
    }
  };

  const openMergeModal = (reportId: string) => {
    setModal({ type: "merge", reportId });
    setMergeTargetId("");
    setSplitDescription("");
    setActionReason("");
    setActionError("");
  };

  const openSplitModal = (reportId: string) => {
    setModal({ type: "split", reportId });
    setMergeTargetId("");
    setSplitDescription("");
    setActionReason("");
    setActionError("");
  };

  const closeModal = () => {
    setModal(null);
    setMergeTargetId("");
    setSplitDescription("");
    setActionReason("");
    setActionError("");
  };

  const handlePriorityChange = (value: PriorityBucket) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set("priority", value); else newParams.delete("priority");
    setSearchParams(newParams);
    setPage(1);
  };

  const handleUnitChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set("unit", value); else newParams.delete("unit");
    setSearchParams(newParams);
    setPage(1);
  };

  const handleSLAChange = (value: SLABucket) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set("sla", value); else newParams.delete("sla");
    setSearchParams(newParams);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

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
              <h1 className="text-xl font-bold tracking-tight">SIGAP Admin</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin-daerah"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Beranda
            </Link>
            <button
              onClick={handleExportCsv}
              className="text-sm font-medium px-3 py-1.5 rounded border border-sigap-border bg-sigap-surface hover:bg-sigap-border transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => useAuthStore.getState().clear()}
              className="text-sm text-sigap-perluTindakan hover:underline"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Wilayah Banner */}
      <div className="bg-info-100 border-b border-info-200 px-6 py-3">
        <p className="text-sm font-medium text-info-600">
          Wilayah Anda: {user?.wilayah_id ?? "—"}
        </p>
      </div>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Daftar Laporan</h2>
          <p className="text-sm text-sigap-textMuted">{total} total</p>
        </div>

        <div className="mb-4 space-y-3">
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-sigap-textTertiary mb-1">Prioritas</label>
              <PriorityFilter value={selectedPriority} onChange={handlePriorityChange} />
            </div>
            <div>
              <label className="block text-xs text-sigap-textTertiary mb-1">Unit</label>
              <UnitFilter value={selectedUnit} onChange={handleUnitChange} />
            </div>
            <div>
              <label className="block text-xs text-sigap-textTertiary mb-1">SLA</label>
              <SLAFilter value={selectedSLA} onChange={handleSLAChange} />
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
        ) : reports.length === 0 ? (
          <p className="text-center text-sigap-textMuted py-8">
            Tidak ada laporan.
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-lg p-4 border border-sigap-border hover:border-sigap-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/admin-daerah/cases/${r.id}`}
                        className="text-sm font-semibold text-sigap-textPrimary hover:underline"
                      >
                        {r.category?.name ?? r.category_id}
                      </Link>
                      <span className="text-xs text-sigap-textTertiary">
                        {r.id.slice(0, 8)}...
                      </span>
                    </div>
                    <p className="text-xs text-sigap-textTertiary mt-1">
                      {new Date(r.created_at).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {r.severity != null && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-xs text-sigap-textMuted">Severity:</span>
                        <span className="text-xs font-medium text-sigap-textSecondary">
                          {r.severity}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                {/* Merge/Split Actions */}
                <div className="mt-3 pt-3 border-t border-sigap-border flex items-center gap-2">
                  <button
                    onClick={() => openMergeModal(r.id)}
                    className="text-xs font-medium px-2 py-1 rounded border border-sigap-border hover:bg-sigap-border transition-colors"
                  >
                    Gabung
                  </button>
                  <button
                    onClick={() => openSplitModal(r.id)}
                    className="text-xs font-medium px-2 py-1 rounded border border-sigap-border hover:bg-sigap-border transition-colors"
                  >
                    Pisahkan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {total > limit && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="flex items-center gap-2">
              <label className="text-sm text-sigap-textMuted">Per halaman:</label>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="text-sm border border-sigap-border rounded px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm text-sigap-textMuted">Halaman {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page * limit) >= total}
              className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Merge/Split Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {modal.type === "merge" ? "Gabungkan Laporan" : "Pisahkan Laporan"}
            </h3>

            {modal.type === "merge" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                    ID Laporan Target
                  </label>
                  <input
                    type="text"
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    placeholder="Masukkan ID laporan target"
                    className="w-full border border-sigap-border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                    Deskripsi Laporan Baru (min. 10 karakter)
                  </label>
                  <textarea
                    value={splitDescription}
                    onChange={(e) => setSplitDescription(e.target.value)}
                    placeholder="Masukkan deskripsi untuk laporan baru"
                    rows={3}
                    className="w-full border border-sigap-border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                Alasan (opsional)
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Masukkan alasan"
                className="w-full border border-sigap-border rounded px-3 py-2 text-sm"
              />
            </div>

            {actionError && (
              <p className="mt-2 text-sm text-danger-500">{actionError}</p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium rounded border border-sigap-border hover:bg-sigap-border transition-colors"
              >
                Batal
              </button>
              <button
                onClick={modal.type === "merge" ? handleMerge : handleSplit}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium rounded bg-sigap-primary text-white hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Memproses..." : modal.type === "merge" ? "Gabungkan" : "Pisahkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
