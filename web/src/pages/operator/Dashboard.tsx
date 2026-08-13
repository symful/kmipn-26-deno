import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import type { Report, Unit, Category, PriorityResponse, DashboardStats, WilayahNode } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

type PriorityBucket = "" | "rendah" | "sedang" | "tinggi" | "kritis";
type SLABucket = "" | "mendekati" | "melanggar";

interface FiltersState {
  wilayah_id: string;
  kategori_id: string;
  status: string;
  assigned_unit_id: string;
  priority: PriorityBucket;
  sla: SLABucket;
}

interface DialogState {
  assign: { open: boolean; reportId: string | null };
  priority: { open: boolean; reportId: string | null };
  escalation: { open: boolean; reportId: string | null };
}

const PRIORITY_OPTIONS: { value: PriorityBucket; label: string }[] = [
  { value: "" as PriorityBucket, label: "Semua Prioritas" },
  { value: "rendah" as PriorityBucket, label: "Rendah" },
  { value: "sedang" as PriorityBucket, label: "Sedang" },
  { value: "tinggi" as PriorityBucket, label: "Tinggi" },
  { value: "kritis" as PriorityBucket, label: "Kritis" },
];

const SLA_OPTIONS: { value: SLABucket; label: string }[] = [
  { value: "" as SLABucket, label: "Semua SLA" },
  { value: "mendekati" as SLABucket, label: "Mendekati SLA" },
  { value: "melanggar" as SLABucket, label: "Melanggar SLA" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "submitted", label: "Perlu Tindakan" },
  { value: "under_review", label: "Sedang Ditinjau" },
  { value: "verified", label: "Terverifikasi" },
  { value: "in_progress", label: "Sedang Dikerjakan" },
  { value: "resolved", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "needs_survey", label: "Perlu Survei" },
];

const DEFAULT_SLA_DAYS = 7;
const DEFAULT_SLA_WARNING_DAYS = 5;

export const OperatorDashboard = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wilayah, setWilayah] = useState<WilayahNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState<FiltersState>({
    wilayah_id: "",
    kategori_id: "",
    status: "",
    assigned_unit_id: "",
    priority: "" as PriorityBucket,
    sla: "" as SLABucket,
  });

  // Dialogs
  const [dialogs, setDialogs] = useState<DialogState>({
    assign: { open: false, reportId: null },
    priority: { open: false, reportId: null },
    escalation: { open: false, reportId: null },
  });

  // Assign dialog form
  const [assignForm, setAssignForm] = useState({
    unitId: "",
    instructions: "",
    deadline: "",
    reason: "",
  });

  // Priority dialog
  const [priorityData, setPriorityData] = useState<PriorityResponse | null>(null);
  const [priorityLoading, setPriorityLoading] = useState(false);

  // Escalation dialog
  const [escalationReason, setEscalationReason] = useState("");

  const user = useAuthStore((s) => s.user);

  // Fetch helper
  const fetchData = useCallback(async (filterParams?: FiltersState) => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof api.reports>[0] = {};
      if (filterParams?.status) params.status = filterParams.status;
      if (filterParams?.wilayah_id) params.wilayah_id = filterParams.wilayah_id;
      if (filterParams?.assigned_unit_id) params.assigned_unit_id = filterParams.assigned_unit_id;
      if (filterParams?.priority) params.priority = filterParams.priority;

      const [reportsData, statsData, unitsData, categoriesData, wilayahData] = await Promise.all([
        api.reports(params),
        api.reportsStats(),
        api.units(),
        api.categories(),
        api.wilayah(),
      ]);

      setReports(reportsData.reports);
      setStats(statsData);
      setUnits(unitsData.units);
      setCategories(categoriesData.categories);
      setWilayah(wilayahData.wilayah);
    } catch (err) {
      logger.error("Failed to fetch dashboard data", { error: err });
      setError("Gagal memuat data: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData(filters);
  }, [filters, fetchData]);

  // Filter reports client-side for kategori and SLA (wilayah handled server-side via API)
  const filteredReports = reports.filter((report) => {
    // Filter by kategori
    if (filters.kategori_id && report.category_id !== filters.kategori_id) return false;

    // Filter by SLA
    if (filters.sla) {
      const created = new Date(report.created_at).getTime();
      const now = Date.now();
      const ageDays = (now - created) / (1000 * 60 * 60 * 24);

      if (filters.sla === "mendekati") {
        if (ageDays < DEFAULT_SLA_WARNING_DAYS || ageDays >= DEFAULT_SLA_DAYS) return false;
      } else if (filters.sla === "melanggar") {
        if (ageDays < DEFAULT_SLA_DAYS) return false;
      }
    }

    return true;
  });

  // Actions
  const handleAssign = async () => {
    if (!dialogs.assign.reportId || !assignForm.unitId) return;

    setActionError(null);
    try {
      await api.reportsAssign(dialogs.assign.reportId, {
        assigned_unit_id: assignForm.unitId,
        ...(assignForm.deadline ? { deadline: assignForm.deadline } : {}),
      });
      setSuccessMessage("Laporan berhasil ditugaskan");
      closeDialogs();
      fetchData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error("Failed to assign report", { error: err });
      setActionError("Gagal menugaskan: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePriorityAdjust = async () => {
    if (!dialogs.priority.reportId) return;
    // Priority adjustment would call an API endpoint if available
    // For now, just show the priority breakdown
    setActionError(null);
    setPriorityLoading(true);
    try {
      const data = await api.reportPriority(dialogs.priority.reportId);
      setPriorityData(data);
    } catch (err) {
      logger.error("Failed to fetch priority", { error: err });
      setActionError("Gagal memuat prioritas: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPriorityLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!dialogs.escalation.reportId || !escalationReason.trim()) return;

    setActionError(null);
    try {
      // Escalation typically changes status or sends to a higher authority
      // Using the updateReport endpoint for status change
      await api.updateReport(dialogs.escalation.reportId, {
        status: "under_review", // or a dedicated escalation status
      });
      setSuccessMessage("Laporan berhasil diekalasi");
      closeDialogs();
      fetchData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error("Failed to escalate report", { error: err });
      setActionError("Gagal mengekalasi: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const openAssignDialog = (reportId: string) => {
    setAssignForm({ unitId: "", instructions: "", deadline: "", reason: "" });
    setActionError(null);
    setDialogs({ assign: { open: true, reportId }, priority: { open: false, reportId: null }, escalation: { open: false, reportId: null } });
  };

  const openPriorityDialog = (reportId: string) => {
    setPriorityData(null);
    setActionError(null);
    setDialogs({ assign: { open: false, reportId: null }, priority: { open: true, reportId }, escalation: { open: false, reportId: null } });
    handlePriorityAdjust();
  };

  const openEscalationDialog = (reportId: string) => {
    setEscalationReason("");
    setActionError(null);
    setDialogs({ assign: { open: false, reportId: null }, priority: { open: false, reportId: null }, escalation: { open: true, reportId } });
  };

  const closeDialogs = () => {
    setDialogs({ assign: { open: false, reportId: null }, priority: { open: false, reportId: null }, escalation: { open: false, reportId: null } });
    setActionError(null);
  };

  // Get wilayah name by ID
  const getWilayahName = (id: string | null | undefined): string => {
    if (!id) return "-";
    const found = wilayah.find((w) => w.id === id);
    return found?.name ?? id;
  };

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
          <button onClick={() => fetchData()} className="px-4 py-2 bg-sigap-primary text-white rounded-lg">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              O
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard Operator</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <Link
            to="/admin"
            className="text-sm font-medium text-sigap-primary hover:underline"
          >
            Kembali
          </Link>
          <Link
            to="/operator/ai-console"
            className="text-sm font-medium text-sigap-primary hover:underline"
          >
            AI Console
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-800 rounded-lg text-sm">
            {successMessage}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="text-xs text-sigap-textMuted">Total Laporan</p>
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
              <p className="text-2xl font-bold text-blue-600">
                {(stats.by_status.in_progress ?? 0) +
                 (stats.by_status.verified ?? 0) +
                 (stats.by_status.assigned ?? 0)}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-sigap-border p-4 mb-6">
          <h2 className="text-sm font-semibold mb-4">Filter</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs text-sigap-textMuted mb-1">Wilayah</label>
              <select
                value={filters.wilayah_id}
                onChange={(e) => setFilters({ ...filters, wilayah_id: e.target.value })}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                <option value="">Semua Wilayah</option>
                {wilayah.filter(w => w.level === "PROVINSI").map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sigap-textMuted mb-1">Kategori</label>
              <select
                value={filters.kategori_id}
                onChange={(e) => setFilters({ ...filters, kategori_id: e.target.value })}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sigap-textMuted mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sigap-textMuted mb-1">Unit</label>
              <select
                value={filters.assigned_unit_id}
                onChange={(e) => setFilters({ ...filters, assigned_unit_id: e.target.value })}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                <option value="">Semua Unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sigap-textMuted mb-1">Prioritas</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value as PriorityBucket })}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sigap-textMuted mb-1">SLA</label>
              <select
                value={filters.sla}
                onChange={(e) => setFilters({ ...filters, sla: e.target.value as SLABucket })}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
              >
                {SLA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Reports List */}
        <div className="bg-white rounded-lg border border-sigap-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Aktivitas Terbaru</h2>
            <span className="text-xs text-sigap-textMuted">
              {filteredReports.length} laporan
            </span>
          </div>
          {filteredReports.length === 0 ? (
            <p className="text-sigap-textMuted text-sm text-center py-4">
              Belum ada laporan.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-start justify-between gap-3 p-3 border border-sigap-border rounded-lg hover:bg-sigap-surface transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">
                        {report.category?.name ?? report.category_id}
                      </p>
                      <StatusBadge status={report.status} />
                    </div>
                    <p className="text-xs text-sigap-textTertiary mt-1 line-clamp-2">
                      {report.description}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-xs text-sigap-textMuted">
                        {new Date(report.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {report.assignee && (
                        <p className="text-xs text-sigap-textMuted">
                          Unit: {report.assignee.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => openAssignDialog(report.id)}
                      className="text-xs text-sigap-primary hover:underline text-center"
                    >
                      Tugaskan
                    </button>
                    <button
                      onClick={() => openPriorityDialog(report.id)}
                      className="text-xs text-sigap-primary hover:underline text-center"
                    >
                      Prioritas
                    </button>
                    <button
                      onClick={() => openEscalationDialog(report.id)}
                      className="text-xs text-red-600 hover:underline text-center"
                    >
                      Escalate
                    </button>
                    <Link
                      to={`/admin/cases/${report.id}`}
                      className="text-xs text-sigap-primary hover:underline text-center"
                    >
                      Detail
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Assign Dialog */}
      {dialogs.assign.open && (
        <DialogOverlay onClose={closeDialogs}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Tugaskan Laporan</h3>
            {actionError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm">
                {actionError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Unit <span className="text-red-600">*</span>
                </label>
                <select
                  value={assignForm.unitId}
                  onChange={(e) => setAssignForm({ ...assignForm, unitId: e.target.value })}
                  className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
                >
                  <option value="">Pilih Unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.type === "surveyor_team" ? "Tim Survei" : "Tim Lapangan"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Instruksi
                </label>
                <textarea
                  value={assignForm.instructions}
                  onChange={(e) => setAssignForm({ ...assignForm, instructions: e.target.value })}
                  placeholder="Instruksi khusus untuk unit..."
                  rows={3}
                  className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Deadline
                </label>
                <input
                  type="datetime-local"
                  value={assignForm.deadline}
                  onChange={(e) => setAssignForm({ ...assignForm, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Alasan
                </label>
                <textarea
                  value={assignForm.reason}
                  onChange={(e) => setAssignForm({ ...assignForm, reason: e.target.value })}
                  placeholder="Alasan penugasan..."
                  rows={2}
                  className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeDialogs}
                className="px-4 py-2 text-sm font-medium text-sigap-textSecondary hover:bg-sigap-surface rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignForm.unitId}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: colors.primary }}
              >
                Tugaskan
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* Priority Dialog */}
      {dialogs.priority.open && (
        <DialogOverlay onClose={closeDialogs}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Detail Prioritas</h3>
            {actionError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm">
                {actionError}
              </div>
            )}
            {priorityLoading ? (
              <div className="text-center py-8 text-sigap-textMuted">Memuat...</div>
            ) : priorityData ? (
              <div className="space-y-4">
                <div className="p-4 bg-sigap-surface rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-sigap-textMuted">Skor</span>
                    <span className="text-2xl font-bold">{priorityData.score}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-sigap-textMuted">Tingkat</span>
                    <span className={`text-sm font-semibold ${
                      priorityData.level === "Kritis" ? "text-red-600" :
                      priorityData.level === "Tinggi" ? "text-orange-600" :
                      priorityData.level === "Sedang" ? "text-yellow-600" :
                      "text-green-600"
                    }`}>
                      {priorityData.level}
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-sigap-textPrimary mb-2">Faktor Breakdown</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-sigap-border">
                      <span className="text-sm text-sigap-textSecondary">Severity</span>
                      <span className="text-sm font-medium">{priorityData.breakdown.severity}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-sigap-border">
                      <span className="text-sm text-sigap-textSecondary">Affected Residents</span>
                      <span className="text-sm font-medium">{priorityData.breakdown.affected_residents}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-sigap-border">
                      <span className="text-sm text-sigap-textSecondary">Region Vulnerability</span>
                      <span className="text-sm font-medium">{priorityData.breakdown.region_vulnerability}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-sigap-border">
                      <span className="text-sm text-sigap-textSecondary">SLA Pressure</span>
                      <span className="text-sm font-medium">{priorityData.breakdown.sla_pressure}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-sigap-textSecondary">Other Factors</span>
                      <span className="text-sm font-medium">{priorityData.breakdown.other_factors}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sigap-textMuted">
                Tidak ada data prioritas
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button
                onClick={closeDialogs}
                className="px-4 py-2 text-sm font-medium text-sigap-textSecondary hover:bg-sigap-surface rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* Escalation Dialog */}
      {dialogs.escalation.open && (
        <DialogOverlay onClose={closeDialogs}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Eskalasi Laporan</h3>
            {actionError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                Alasan Eskalsi <span className="text-red-600">*</span>
              </label>
              <textarea
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="Jelaskan alasan eskalasi..."
                rows={4}
                className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-white text-sigap-textPrimary focus:outline-none focus:border-sigap-primary resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeDialogs}
                className="px-4 py-2 text-sm font-medium text-sigap-textSecondary hover:bg-sigap-surface rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleEscalate}
                disabled={!escalationReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
              >
                Eskalasi
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
};

// Simple Dialog Overlay Component
function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
