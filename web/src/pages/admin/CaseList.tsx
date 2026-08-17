import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import type { Report, ReportStatus } from "../../types";
import { StatusFilter } from "../../components/StatusFilter";
import { StatusBadge } from "../../components/StatusBadge";
import {
  RegionFilter,
  PriorityFilter,
  UnitFilter,
  SLAFilter,
} from "../../components/CaseFilters";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import type { RegionFilterValue } from "../../types";
import type { PriorityBucket, SLABucket } from "../../components/CaseFilters";
import { logger } from "@/lib/logger";
import { downloadBlob } from "@/lib/download";

interface MergeSplitModal {
  type: "merge" | "split";
  reportId: string;
}

export const AdminCaseList = () => {
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

  // Extract primitives for deps to avoid infinite loop from object recreation
  const selectedProvinsi = searchParams.get("provinsi") ?? "";
  const selectedKabupaten = searchParams.get("kabupaten") ?? "";
  const selectedKecamatan = searchParams.get("kecamatan") ?? "";
  const selectedDesa = searchParams.get("desa") ?? "";
  const selectedRegion: RegionFilterValue = {
    provinsi: selectedProvinsi,
    kabupaten: selectedKabupaten,
    kecamatan: selectedKecamatan,
    desa: selectedDesa,
  };
  const selectedPriority = (searchParams.get("priority") ?? "") as PriorityBucket;
  const selectedUnit = searchParams.get("unit") ?? "";
  const selectedSLA = (searchParams.get("sla") ?? "") as SLABucket;

  useEffect(() => {
    setLoading(true);
    const params: {
      status?: string;
      page: number;
      limit: number;
      wilayah_id?: string;
      priority?: string;
      assigned_unit_id?: string;
      sla?: string;
    } = { page, limit };
    if (statusFilter !== "") params.status = statusFilter;
    const deepestWilayah = selectedDesa || selectedKecamatan || selectedKabupaten || selectedProvinsi;
    if (deepestWilayah) params.wilayah_id = deepestWilayah;
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
  }, [statusFilter, page, limit, selectedProvinsi, selectedKabupaten, selectedKecamatan, selectedDesa, selectedPriority, selectedUnit, selectedSLA]);

  const handleExportGeoJSON = async () => {
    try {
      const blob = await api.exportGeojson();
      downloadBlob(blob, "export.geojson");
    } catch (err) {
      logger.error("GeoJSON export failed: " + (err instanceof Error ? err.message : String(err)), { error: err });
      alert("Gagal mengekspor GeoJSON");
    }
  };

  const handleExportCsv = async () => {
    try {
      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;
      const csv = await api.exportCsv(params);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `reports-export-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      logger.error("CSV export failed: " + (err instanceof Error ? err.message : String(err)), { error: err });
      alert("Gagal mengekspor CSV");
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
      logger.error("Failed to merge cases", { error: e });
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
      logger.error("Failed to split case", { error: e });
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

  const handleRegionChange = (value: RegionFilterValue) => {
    const newParams = new URLSearchParams(searchParams);
    if (value.provinsi) newParams.set("provinsi", value.provinsi); else newParams.delete("provinsi");
    if (value.kabupaten) newParams.set("kabupaten", value.kabupaten); else newParams.delete("kabupaten");
    if (value.kecamatan) newParams.set("kecamatan", value.kecamatan); else newParams.delete("kecamatan");
    if (value.desa) newParams.set("desa", value.desa); else newParams.delete("desa");
    setSearchParams(newParams);
    setPage(1);
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
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-gradient-to-r from-surface-sidebar to-[#1E3D37] px-6 py-5 shadow-lg">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">SIGAP Admin</h1>
              <p className="text-sm text-white/70">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="text-sm font-medium text-white/80 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              Beranda
            </Link>
            <button
              onClick={handleExportCsv}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportCsv}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Export PDF
            </button>
            <button
              onClick={handleExportGeoJSON}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Export GeoJSON
            </button>
            <button
              onClick={() => useAuthStore.getState().clear()}
              className="text-sm text-red-300 hover:text-red-200 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Daftar Kasus</h2>
            <p className="text-sm text-neutral-500 mt-0.5">{total} total kasus</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-6">
          <div className="flex flex-col gap-4">
            <StatusFilter value={statusFilter} onChange={setStatusFilter} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Wilayah</label>
                <RegionFilter value={selectedRegion} onChange={handleRegionChange} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Prioritas</label>
                <PriorityFilter value={selectedPriority} onChange={handlePriorityChange} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Unit</label>
                <UnitFilter value={selectedUnit} onChange={handleUnitChange} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">SLA</label>
                <SLAFilter value={selectedSLA} onChange={handleSLAChange} />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin mx-auto mb-3" style={{ borderColor: colors.primary, borderTopColor: "transparent" }} />
            <p className="text-neutral-500 text-sm">Memuat data...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-neutral-600 font-medium">Tidak ada kasus ditemukan</p>
            <p className="text-neutral-400 text-sm mt-1">Coba ubah filter untuk melihat hasil lain</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-xl p-4 border border-neutral-200 hover:border-primary-500/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        to={`/admin/cases/${r.id}`}
                        className="text-sm font-semibold text-neutral-900 hover:text-primary-600 transition-colors"
                      >
                        {r.category?.name ?? r.category_id}
                      </Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                        {r.id.slice(0, 8)}
                      </span>
                      <span>
                        {new Date(r.created_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {r.severity != null && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.severity > 70 ? colors.perluTindakan : r.severity > 40 ? "#b8730a" : colors.primary }} />
                          Severity {r.severity}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openMergeModal(r.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-primary-500 hover:text-primary-600 transition-colors"
                    >
                      Gabung
                    </button>
                    <button
                      onClick={() => openSplitModal(r.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-primary-500 hover:text-primary-600 transition-colors"
                    >
                      Pisahkan
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {total > limit && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-500">Per halaman:</label>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
              className="px-4 py-1.5 rounded-lg border border-neutral-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
            >
              Prev
            </button>
            <span className="text-sm text-neutral-500">Halaman {page} dari {Math.ceil(total / limit)}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page * limit) >= total}
              className="px-4 py-1.5 rounded-lg border border-neutral-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary + "20" }}>
                <svg className="w-5 h-5" style={{ color: colors.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {modal.type === "merge" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M8 17H4m0 0l4-4m-4 4l4 4" />
                  )}
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                {modal.type === "merge" ? "Gabungkan Laporan" : "Pisahkan Laporan"}
              </h3>
            </div>

            {modal.type === "merge" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1.5">
                    ID Laporan Target
                  </label>
                  <input
                    type="text"
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    placeholder="Masukkan ID laporan target"
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1.5">
                    Deskripsi Laporan Baru (min. 10 karakter)
                  </label>
                  <textarea
                    value={splitDescription}
                    onChange={(e) => setSplitDescription(e.target.value)}
                    placeholder="Masukkan deskripsi untuk laporan baru"
                    rows={3}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-neutral-600 mb-1.5">
                Alasan (opsional)
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Masukkan alasan"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {actionError && (
              <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {actionError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={modal.type === "merge" ? handleMerge : handleSplit}
                disabled={actionLoading}
                className="px-5 py-2.5 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: colors.primary }}
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