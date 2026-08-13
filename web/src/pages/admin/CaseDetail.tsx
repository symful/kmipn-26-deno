import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Report, AgentAssessment, PriorityResponse } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { AIAssessmentViewer } from "../../components/AIAssessmentViewer";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

type DecisionType = "valid" | "needs_completion" | "needs_survey" | "duplicate" | "out_of_scope" | "rejected";

interface StatusTransition {
  label: string;
  action: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger" | "warning" | "info";
  confirm?: string;
}

interface TransitionMap {
  [status: string]: StatusTransition[];
}

export const AdminCaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [assessments, setAssessments] = useState<AgentAssessment[]>([]);
  const [priority, setPriority] = useState<PriorityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRtRwModal, setShowRtRwModal] = useState(false);
  const [rtRwUserId, setRtRwUserId] = useState("");
  const [rtRwLoading, setRtRwLoading] = useState(false);
  const [rtRwMagicLink, setRtRwMagicLink] = useState<string | null>(null);
  const [rtRwError, setRtRwError] = useState<string | null>(null);
  const [showDecideModal, setShowDecideModal] = useState(false);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [showSeparateModal, setShowSeparateModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showVerifyCompletionModal, setShowVerifyCompletionModal] = useState(false);
  const [decideDecision, setDecideDecision] = useState<DecisionType | "">("");
  const [decideReason, setDecideReason] = useState("");
  const [decideSurveyorId, setDecideSurveyorId] = useState("");
  const [decideDeadline, setDecideDeadline] = useState("");
  const [decideUnitId, setDecideUnitId] = useState("");
  const [combineTargetId, setCombineTargetId] = useState("");
  const [combineReason, setCombineReason] = useState("");
  const [separateDescription, setSeparateDescription] = useState("");
  const [separateReason, setSeparateReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [verifyDecision, setVerifyDecision] = useState<"approved" | "rejected">("approved");
  const [verifyReason, setVerifyReason] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const user = useAuthStore((s) => s.user);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.report(id);
      setReport(r);
    } catch {
      setError("Gagal memuat laporan");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAssessments = async () => {
    if (!id) return;
    try {
      const res = await api.reportAssessments(id);
      setAssessments(res.assessments as unknown as AgentAssessment[]);
    } catch {
      setAssessments([]);
    }
  };

  const loadPriority = async () => {
    if (!id) return;
    try {
      const p = await api.reportPriority(id);
      setPriority(p);
    } catch {
      setPriority(null);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (report) {
      loadAssessments();
      loadPriority();
    }
  }, [report]);

  const handleAssess = async () => {
    if (!report || report.photo_urls.length === 0) return;
    setAssessing(true);
    try {
      await api.assess({
        report_id: report.id,
        assessment_kind: "initial",
      });
      await loadAssessments();
    } catch (e) {
      logger.error("Failed to assess report", { error: e });
      setError("Penilaian AI gagal");
    } finally {
      setAssessing(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!report) return;
    setUpdatingStatus(true);
    try {
      await api.updateReport(report.id, { status: newStatus });
      await load();
      await loadPriority();
    } catch (e) {
      logger.error("Failed to change status", { error: e });
      setError((e as Error).message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleVerifikatorAccept = async () => {
    if (!report) return;
    setActionLoading(true);
    try {
      const body: { reason?: string; assigned_unit_id?: string; deadline?: string } = { reason: "" };
      if (decideUnitId) body.assigned_unit_id = decideUnitId;
      if (decideDeadline) body.deadline = decideDeadline;
      await api.verifikatorAccept(report.id, body);
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to accept verifikator", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecide = async () => {
    if (!report || !decideDecision) return;
    setActionLoading(true);
    try {
      const body: {
        decision: DecisionType;
        reason?: string;
        surveyor_id?: string;
        deadline?: string;
      } = { decision: decideDecision };
      if (decideReason) body.reason = decideReason;
      if (decideDecision === "needs_survey" && decideSurveyorId) body.surveyor_id = decideSurveyorId;
      if (decideDecision === "needs_survey" && decideDeadline) body.deadline = decideDeadline;
      await api.verifikatorDecide(report.id, body);
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to decide", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCombine = async () => {
    if (!report || !combineTargetId) return;
    setActionLoading(true);
    try {
      await api.verifikatorCombine(report.id, {
        target_case_id: combineTargetId,
        reason: combineReason,
      });
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to combine cases", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSeparate = async () => {
    if (!report || !separateDescription) return;
    setActionLoading(true);
    try {
      await api.verifikatorSeparate(report.id, {
        new_case_description: separateDescription,
        reason: separateReason,
      });
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to separate case", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!report || !rejectReason) return;
    setActionLoading(true);
    try {
      await api.verifikatorReject(report.id, { reason: rejectReason });
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to reject case", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyCompletion = async () => {
    if (!report) return;
    setActionLoading(true);
    try {
      const body: { decision: "approved" | "rejected"; reason?: string; completion_notes?: string } = {
        decision: verifyDecision,
      };
      if (verifyReason) body.reason = verifyReason;
      if (verifyNotes) body.completion_notes = verifyNotes;
      await api.verifikatorVerifyCompletion(report.id, body);
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to verify completion", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendRtRwVerification = async () => {
    if (!report || !rtRwUserId.trim()) return;
    setRtRwLoading(true);
    setRtRwError(null);
    try {
      const result = await api.generateRtRwToken({
        report_id: report.id,
        rt_rw_user_id: rtRwUserId.trim(),
      });
      setRtRwMagicLink(result.magic_link);
    } catch (e) {
      logger.error("Failed to send RT/RW verification", { error: e });
      setRtRwError((e as Error).message);
    } finally {
      setRtRwLoading(false);
    }
  };

  const closeAllModals = () => {
    setShowDecideModal(false);
    setShowCombineModal(false);
    setShowSeparateModal(false);
    setShowRejectModal(false);
    setShowVerifyCompletionModal(false);
    setDecideDecision("");
    setDecideReason("");
    setDecideSurveyorId("");
    setDecideDeadline("");
    setDecideUnitId("");
    setCombineTargetId("");
    setCombineReason("");
    setSeparateDescription("");
    setSeparateReason("");
    setRejectReason("");
    setVerifyDecision("approved");
    setVerifyReason("");
    setVerifyNotes("");
  };

  const closeRtRwModal = () => {
    setShowRtRwModal(false);
    setRtRwUserId("");
    setRtRwMagicLink(null);
    setRtRwError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <p className="text-sigap-textMuted">Memuat...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <p className="text-sigap-textMuted">Laporan tidak ditemukan.</p>
      </div>
    );
  }

  const isTerminal = ["resolved", "rejected", "closed", "duplicate_merged", "merged", "separated", "out_of_scope"].includes(report.status);
  const isReviewed = ["under_review"].includes(report.status);

  const transitions: TransitionMap = {
    submitted: [
      {
        label: "Terima",
        action: handleVerifikatorAccept,
        variant: "primary",
        confirm: "Terima laporan ini?",
      },
      {
        label: "Validasi",
        action: () => {
          setDecideDecision("valid");
          setShowDecideModal(true);
        },
        variant: "primary",
      },
      {
        label: "Perlu Lengkap",
        action: () => {
          setDecideDecision("needs_completion");
          setShowDecideModal(true);
        },
        variant: "warning",
      },
      {
        label: "Kirim ke Survei",
        action: () => {
          setDecideDecision("needs_survey");
          setShowDecideModal(true);
        },
        variant: "info",
      },
      {
        label: "Gabungkan",
        action: () => setShowCombineModal(true),
        variant: "info",
      },
      {
        label: "Pisahkan",
        action: () => setShowSeparateModal(true),
        variant: "info",
      },
      {
        label: "Tolak",
        action: () => setShowRejectModal(true),
        variant: "danger",
      },
    ],
    under_review: [
      {
        label: "Terima",
        action: handleVerifikatorAccept,
        variant: "primary",
        confirm: "Terima laporan ini?",
      },
      {
        label: "Validasi",
        action: () => {
          setDecideDecision("valid");
          setShowDecideModal(true);
        },
        variant: "primary",
      },
      {
        label: "Perlu Lengkap",
        action: () => {
          setDecideDecision("needs_completion");
          setShowDecideModal(true);
        },
        variant: "warning",
      },
      {
        label: "Kirim ke Survei",
        action: () => {
          setDecideDecision("needs_survey");
          setShowDecideModal(true);
        },
        variant: "info",
      },
      {
        label: "Duplikat",
        action: () => {
          setDecideDecision("duplicate");
          setShowDecideModal(true);
        },
        variant: "info",
      },
      {
        label: "Luar Cakupan",
        action: () => {
          setDecideDecision("out_of_scope");
          setShowDecideModal(true);
        },
        variant: "warning",
      },
      {
        label: "Gabungkan",
        action: () => setShowCombineModal(true),
        variant: "info",
      },
      {
        label: "Pisahkan",
        action: () => setShowSeparateModal(true),
        variant: "info",
      },
      {
        label: "Tolak",
        action: () => setShowRejectModal(true),
        variant: "danger",
      },
    ],
    needs_completion: [
      {
        label: "Validasi Ulang",
        action: () => {
          setDecideDecision("valid");
          setShowDecideModal(true);
        },
        variant: "primary",
      },
      {
        label: "Kirim ke Survei",
        action: () => {
          setDecideDecision("needs_survey");
          setShowDecideModal(true);
        },
        variant: "info",
      },
      {
        label: "Tolak",
        action: () => setShowRejectModal(true),
        variant: "danger",
      },
    ],
    needs_survey: [
      {
        label: "Verifikasi completion",
        action: () => setShowVerifyCompletionModal(true),
        variant: "primary",
      },
    ],
    verified: [
      {
        label: "Tugaskan ke Petugas",
        action: () => handleStatusChange("in_progress"),
        variant: "primary",
        confirm: "Tugaskan laporan ini ke petugas lapangan?",
      },
      {
        label: "Gabungkan",
        action: () => setShowCombineModal(true),
        variant: "info",
      },
      {
        label: "Pisahkan",
        action: () => setShowSeparateModal(true),
        variant: "info",
      },
    ],
    in_progress: [
      {
        label: "Tandai Selesai",
        action: () => handleStatusChange("resolved"),
        variant: "primary",
        confirm: "Tandai laporan ini sebagai selesai?",
      },
      {
        label: "Tolak",
        action: () => setShowRejectModal(true),
        variant: "danger",
      },
    ],
  };

  const availableTransitions = transitions[report.status] || [];

  const openStreetMapUrl = report.lat && report.lng
    ? `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}&zoom=16`
    : null;

  const getPriorityColor = (level: string) => {
    switch (level) {
      case "Kritis": return colors.perluTindakan || "#dc2626";
      case "Tinggi": return "#ea580c";
      case "Sedang": return colors.diproses || "#2563eb";
      case "Rendah": return "#22c55e";
      default: return "#6b7280";
    }
  };

  const getVariantStyle = (variant?: string) => {
    switch (variant) {
      case "primary": return { backgroundColor: colors.primary };
      case "danger": return { backgroundColor: colors.perluTindakan || "#dc2626" };
      case "warning": return { backgroundColor: colors.perluTindakan || "#ea580c" };
      case "info": return { backgroundColor: colors.diproses || "#2563eb" };
      default: return { backgroundColor: colors.primary };
    }
  };

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/cases"
              className="text-2xl font-bold"
              style={{ color: colors.primary }}
            >
              S
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Detail Laporan
              </h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/cases"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Daftar
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

      <main className="p-6 max-w-4xl mx-auto space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        <div className="bg-white rounded-lg p-6 border border-sigap-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">
                {report.category?.name ?? report.category_id}
              </h2>
              <p className="text-sm text-sigap-textMuted mt-1">
                ID: {report.id}
              </p>
            </div>
            <StatusBadge status={report.status} />
          </div>

          <p className="mt-4 text-sm text-sigap-textSecondary whitespace-pre-wrap">
            {report.description}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-sigap-textTertiary">Dibuat: </span>
              <span className="text-sigap-textSecondary">
                {new Date(report.created_at).toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {report.severity != null && (
              <div>
                <span className="text-sigap-textTertiary">Severity: </span>
                <span className="text-sigap-textSecondary">
                  {report.severity}%
                </span>
              </div>
            )}
            {report.assignee && (
              <div>
                <span className="text-sigap-textTertiary">Ditugaskan: </span>
                <span className="text-sigap-textSecondary">
                  {report.assignee.name}
                </span>
              </div>
            )}
          </div>

          {report.lat != null && report.lng != null && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-sigap-textSecondary mb-2">Lokasi</h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-sigap-textMuted font-mono">
                  {report.lat.toFixed(6)}, {report.lng.toFixed(6)}
                </span>
                {openStreetMapUrl && (
                  <a
                    href={openStreetMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Buka di OSM
                  </a>
                )}
              </div>
              <div className="mt-2 rounded overflow-hidden border border-sigap-border h-40">
                <iframe
                  title="Lokasi Laporan"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight={0}
                  marginWidth={0}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${report.lng - 0.005},${report.lat - 0.005},${report.lng + 0.005},${report.lat + 0.005}&layer=mapnik&marker=${report.lat},${report.lng}`}
                />
              </div>
            </div>
          )}

          {!isTerminal && availableTransitions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {availableTransitions.map((t, i) => (
                <button
                  key={i}
                  onClick={t.action}
                  disabled={updatingStatus || actionLoading}
                  className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                  style={getVariantStyle(t.variant)}
                >
                  {actionLoading ? "Memproses..." : t.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowRtRwModal(true)}
              className="text-sm px-4 py-2 rounded font-medium text-white transition-opacity"
              style={{ backgroundColor: colors.diproses }}
            >
              Kirim Verifikasi RT/RW
            </button>
          </div>
        </div>

        {priority && (
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <h3 className="font-semibold mb-3">Skor Prioritas</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-3xl font-bold" style={{ color: getPriorityColor(priority.level) }}>
                {priority.score}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-sigap-textSecondary">
                  Level: {priority.level}
                </div>
                <div className="text-xs text-sigap-textMuted">
                  Versi {priority.version}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: "Severity", value: priority.breakdown.severity },
                { label: "Residents", value: priority.breakdown.affected_residents },
                { label: "Vulnerability", value: priority.breakdown.region_vulnerability },
                { label: "SLA", value: priority.breakdown.sla_pressure },
                { label: "Other", value: priority.breakdown.other_factors },
              ].map((factor) => (
                <div key={factor.label} className="flex items-center gap-2">
                  <span className="text-xs text-sigap-textMuted w-24">{factor.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${factor.value}%`,
                        backgroundColor: getPriorityColor(priority.level),
                      }}
                    />
                  </div>
                  <span className="text-xs text-sigap-textMuted w-12 text-right">{factor.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.photo_urls.length > 0 && (
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <h3 className="font-semibold mb-3">Foto</h3>
            <div className="grid grid-cols-2 gap-3">
              {report.photo_urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Foto ${i + 1}`}
                  className="w-full h-48 object-cover rounded border border-sigap-border"
                />
              ))}
            </div>
          </div>
        )}

        {assessments.length > 0 && (
          <AIAssessmentViewer assessment={assessments[0] ?? null} loading={false} />
        )}

        {report.photo_urls.length > 0 && (
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <button
              onClick={handleAssess}
              disabled={assessing}
              className="w-full text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: colors.diproses }}
            >
              {assessing
                ? "Menjalankan AI Penilaian..."
                : "Jalankan AI Penilaian"}
            </button>
          </div>
        )}
      </main>

      {showDecideModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">
              {decideDecision === "valid" && "Validasi Laporan"}
              {decideDecision === "needs_completion" && "Minta Kelengkapan"}
              {decideDecision === "needs_survey" && "Kirim ke Survei"}
              {decideDecision === "duplicate" && "Tandai Duplikat"}
              {decideDecision === "out_of_scope" && "Luar Cakupan"}
              {decideDecision === "rejected" && "Tolak Laporan"}
            </h3>

            <div className="space-y-4">
              {decideDecision === "needs_survey" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                      ID Surveyor *
                    </label>
                    <input
                      type="text"
                      value={decideSurveyorId}
                      onChange={(e) => setDecideSurveyorId(e.target.value)}
                      placeholder="UUID Surveyor"
                      className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                      Deadline (opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={decideDeadline}
                      onChange={(e) => setDecideDeadline(e.target.value)}
                      className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                    />
                  </div>
                </>
              )}

              {decideDecision === "duplicate" && (
                <div>
                  <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                    ID Laporan Utama *
                  </label>
                  <input
                    type="text"
                    value={decideReason}
                    onChange={(e) => setDecideReason(e.target.value)}
                    placeholder="UUID Laporan duplikat"
                    className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  Alasan (opsional)
                </label>
                <textarea
                  value={decideReason}
                  onChange={(e) => setDecideReason(e.target.value)}
                  placeholder="Alasan keputusan..."
                  rows={3}
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded font-medium text-sigap-textSecondary hover:bg-gray-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleDecide}
                disabled={actionLoading || (decideDecision === "needs_survey" && !decideSurveyorId)}
                className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {actionLoading ? "Memproses..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCombineModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Gabungkan Laporan</h3>
            <p className="text-sm text-sigap-textSecondary mb-4">
              Laporan ini akan digabungkan dengan laporan lain sebagai duplikat.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  ID Laporan Target *
                </label>
                <input
                  type="text"
                  value={combineTargetId}
                  onChange={(e) => setCombineTargetId(e.target.value)}
                  placeholder="UUID Laporan target"
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  Alasan
                </label>
                <textarea
                  value={combineReason}
                  onChange={(e) => setCombineReason(e.target.value)}
                  placeholder="Alasan penggabungan..."
                  rows={3}
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded font-medium text-sigap-textSecondary hover:bg-gray-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleCombine}
                disabled={actionLoading || !combineTargetId}
                className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {actionLoading ? "Memproses..." : "Gabungkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSeparateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Pisahkan Laporan</h3>
            <p className="text-sm text-sigap-textSecondary mb-4">
              Laporan ini akan dipisahkan menjadi dua laporan.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  Deskripsi Laporan Baru *
                </label>
                <textarea
                  value={separateDescription}
                  onChange={(e) => setSeparateDescription(e.target.value)}
                  placeholder="Deskripsi untuk laporan baru (minimal 10 karakter)..."
                  rows={3}
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  Alasan
                </label>
                <textarea
                  value={separateReason}
                  onChange={(e) => setSeparateReason(e.target.value)}
                  placeholder="Alasan pemisahan..."
                  rows={2}
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded font-medium text-sigap-textSecondary hover:bg-gray-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleSeparate}
                disabled={actionLoading || separateDescription.length < 10}
                className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {actionLoading ? "Memproses..." : "Pisahkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Tolak Laporan</h3>
            <p className="text-sm text-sigap-textSecondary mb-4">
              Laporan ini akan ditolak. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div>
              <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                Alasan Penolakan *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Alasan penolakan (minimal 10 karakter)..."
                rows={3}
                className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded font-medium text-sigap-textSecondary hover:bg-gray-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || rejectReason.length < 10}
                className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.perluTindakan || "#dc2626" }}
              >
                {actionLoading ? "Memproses..." : "Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerifyCompletionModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Verifikasi completion</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-2">
                  Keputusan *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="verifyDecision"
                      value="approved"
                      checked={verifyDecision === "approved"}
                      onChange={() => setVerifyDecision("approved")}
                    />
                    <span className="text-sm">Setuju</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="verifyDecision"
                      value="rejected"
                      checked={verifyDecision === "rejected"}
                      onChange={() => setVerifyDecision("rejected")}
                    />
                    <span className="text-sm">Perbaiki</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  Catatan (opsional)
                </label>
                <textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Catatan verifikasi..."
                  rows={2}
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sigap-textSecondary mb-1">
                  Alasan (opsional)
                </label>
                <textarea
                  value={verifyReason}
                  onChange={(e) => setVerifyReason(e.target.value)}
                  placeholder="Alasan keputusan..."
                  rows={2}
                  className="w-full px-3 py-2 border border-sigap-border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded font-medium text-sigap-textSecondary hover:bg-gray-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleVerifyCompletion}
                disabled={actionLoading}
                className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {actionLoading ? "Memproses..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRtRwModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRtRwModal();
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Kirim Verifikasi RT/RW</h3>

            {!rtRwMagicLink ? (
              <>
                <p className="text-sm text-sigap-textSecondary mb-4">
                  Masukkan ID User RT/RW untuk mengirim tautan verifikasi.
                </p>
                <input
                  type="text"
                  value={rtRwUserId}
                  onChange={(e) => setRtRwUserId(e.target.value)}
                  placeholder="ID User RT/RW"
                  className="w-full px-3 py-2 border border-sigap-border rounded mb-4 text-sm"
                />
                {rtRwError && (
                  <p className="text-sm text-red-600 mb-4">{rtRwError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeRtRwModal}
                    className="text-sm px-4 py-2 rounded font-medium text-sigap-textSecondary hover:bg-gray-100 transition-opacity"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSendRtRwVerification}
                    disabled={rtRwLoading || !rtRwUserId.trim()}
                    className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: colors.primary }}
                  >
                    {rtRwLoading ? "Mengirim..." : "Kirim"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-sigap-textSecondary mb-4">
                  Tautan verifikasi berhasil dibuat:
                </p>
                <div className="bg-gray-50 rounded p-3 mb-4 break-all">
                  <a
                    href={rtRwMagicLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {rtRwMagicLink}
                  </a>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeRtRwModal}
                    className="text-sm px-4 py-2 rounded font-medium text-white transition-opacity"
                    style={{ backgroundColor: colors.primary }}
                  >
                    Tutup
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
