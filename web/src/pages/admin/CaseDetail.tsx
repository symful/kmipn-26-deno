import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Report, AgentAssessment, PriorityResponse } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { AIAssessmentViewer } from "../../components/AIAssessmentViewer";
import { TimelineRail, type TimelineEvent } from "../../components/case-detail/TimelineRail";
import { SupportingGallery } from "../../components/case-detail/SupportingGallery";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

type DecisionType = "valid" | "needs_completion" | "needs_survey" | "duplicate" | "out_of_scope" | "rejected";
type TabType = "ringkasan" | "bukti" | "verifikasi" | "tugas" | "audit";

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
  const [activeTab, setActiveTab] = useState<TabType>("ringkasan");
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
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-sm text-neutral-400">Memuat...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-sm text-neutral-400">Laporan tidak ditemukan.</p>
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
      case "Tinggi": return colors.warning || "#B8730A";
      case "Sedang": return colors.diproses || "#2563eb";
      case "Rendah": return colors.selesai || "#22C55E";
      default: return "#6b7280";
    }
  };

  const getPriorityBgColor = (level: string) => {
    switch (level) {
      case "Kritis": return "bg-danger-100";
      case "Tinggi": return "bg-warning-100";
      case "Sedang": return "bg-info-100";
      case "Rendah": return "bg-primary-50";
      default: return "bg-neutral-100";
    }
  };

  const getPriorityTextColor = (level: string) => {
    switch (level) {
      case "Kritis": return "text-danger-600";
      case "Tinggi": return "text-warning-600";
      case "Sedang": return "text-info-600";
      case "Rendah": return "text-primary-700";
      default: return "text-neutral-500";
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

  const tabs = [
    { id: "ringkasan" as TabType, label: "Ringkasan" },
    { id: "bukti" as TabType, label: "Bukti & Laporan" },
    { id: "verifikasi" as TabType, label: "Verifikasi" },
    { id: "tugas" as TabType, label: "Tugas & Progres" },
    { id: "audit" as TabType, label: "Riwayat Audit" },
  ];

  return (
    <div className="min-h-screen bg-sigap-background">

      <div className="bg-white border-b border-sigap-border px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
              <div className="w-3 h-3 rounded-full bg-[#febc2e]"></div>
              <div className="w-3 h-3 rounded-full bg-[#28c840]"></div>
            </div>
            <div className="flex-1 max-w-md bg-neutral-100 rounded-md px-3 py-1.5 flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-full bg-sigap-primary flex items-center justify-center">
                <span className="text-[6px] font-bold text-white">P</span>
              </div>
              <span className="text-xs font-mono text-neutral-500">app.pantaudesa.id/kasus/{report.id}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-sigap-border px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
            <Link to="/admin/cases" className="hover:text-sigap-primary">Peta & Kasus</Link>
            <span>/</span>
            <span className="font-mono text-neutral-700">{report.id}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-sigap-primary text-white">
                {report.category?.name ?? report.category_id}
              </span>
              <StatusBadge status={report.status} />
              {priority && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${getPriorityBgColor(priority.level)} ${getPriorityTextColor(priority.level)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${priority.level === "Kritis" ? "bg-danger-500" : priority.level === "Tinggi" ? "bg-warning-500" : priority.level === "Sedang" ? "bg-info-500" : "bg-primary-500"}`}></span>
                  Prioritas {priority.level}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="text-sm px-4 py-2 rounded-lg font-semibold border border-sigap-primary text-sigap-primary hover:bg-sigap-primary hover:text-white transition-colors">
                Gabungkan
              </button>
              <button className="text-sm px-4 py-2 rounded-lg font-semibold text-white transition-colors" style={{ backgroundColor: colors.diproses }}>
                Verifikasi kasus
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-sigap-border px-6">
        <div className="max-w-7xl mx-auto flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-sm font-semibold pb-3 px-1 mx-4 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "text-sigap-primary border-sigap-primary"
                  : "text-neutral-500 border-transparent hover:text-neutral-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {error && (
              <div className="bg-danger-100 border border-danger-500/30 text-danger-600 px-4 py-3 rounded-lg text-sm">
                {error}
                <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
              </div>
            )}

            {activeTab === "ringkasan" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {report.lat != null && report.lng != null && (
                    <div className="bg-white rounded-xl border border-sigap-border overflow-hidden">
                      <div className="h-36 relative" style={{ backgroundColor: "#eaeee9" }}>
                        <div className="absolute inset-0 opacity-40" style={{
                          backgroundImage: "linear-gradient(#dfe4de 1px, transparent 1px), linear-gradient(90deg, #dfe4de 1px, transparent 1px)",
                          backgroundSize: "30px 30px"
                        }}></div>
                        <a
                          href={openStreetMapUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute left-1/2 top-1/2 w-4 h-4 rounded-full bg-danger-500 border-2 border-white"
                          style={{ transform: "translate(-50%, -50%)" }}
                        ></a>
                      </div>
                      <div className="p-3 flex justify-between items-center">
                        <span className="font-mono text-xs text-neutral-500">
                          {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                        </span>
                        <a
                          href={openStreetMapUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sigap-primary font-semibold hover:underline"
                        >
                          Buka peta penuh
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-sigap-border p-4">
                    <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Dampak</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-danger-500 rounded-sm"></span>
                        <span className="text-sm">Dampak signifikan terhadap wilayah</span>
                      </div>
                      {report.severity && report.severity > 50 && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-warning-500 rounded-sm"></span>
                          <span className="text-sm">Risiko keselamatan tinggi</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-500">
                      Laporan dari warga dalam radius terkait.
                    </div>
                  </div>
                </div>

                {priority && (
                  <div className="bg-white rounded-xl border border-sigap-border p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-3xl font-bold" style={{ color: getPriorityColor(priority.level) }}>
                            {priority.score}
                          </div>
                          <div className="text-xs text-neutral-500">Skor prioritas / 100</div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold ${getPriorityBgColor(priority.level)} ${getPriorityTextColor(priority.level)}`}>
                          Prioritas {priority.level}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-neutral-500">model v{priority.version}</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: "Severity", value: priority.breakdown.severity, color: "bg-sigap-primary" },
                        { label: "Residents", value: priority.breakdown.affected_residents, color: "bg-sigap-primary" },
                        { label: "Vulnerability", value: priority.breakdown.region_vulnerability, color: "bg-sigap-primary" },
                        { label: "SLA", value: priority.breakdown.sla_pressure, color: "bg-warning-500" },
                      ].map((factor) => (
                        <div key={factor.label} className="flex items-center gap-3">
                          <span className="w-32 text-xs text-neutral-700">{factor.label}</span>
                          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${factor.color}`}
                              style={{ width: `${factor.value}%` }}
                            ></div>
                          </div>
                          <span className="w-10 text-xs font-semibold text-right">{factor.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <SupportingGallery
                  reportId={id ?? ""}
                />
              </>
            )}

            {activeTab === "bukti" && (
              <div className="space-y-6">
                {report.photo_urls.length > 0 && (
                  <div className="bg-white rounded-xl border border-sigap-border p-5">
                    <h3 className="text-sm font-bold mb-3">Foto Bukti</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {report.photo_urls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Foto ${i + 1}`}
                          className="w-full h-28 object-cover rounded-lg border border-neutral-200"
                        />
                      ))}
                    </div>
                  </div>
                )}
                <SupportingGallery
                  reportId={id ?? ""}
                />
              </div>
            )}

            {activeTab === "verifikasi" && (
              <div className="bg-white rounded-xl border border-sigap-border p-5">
                <p className="text-sm text-neutral-500">Verifikasi akan ditampilkan di sini.</p>
              </div>
            )}

            {activeTab === "tugas" && (
              <div className="bg-white rounded-xl border border-sigap-border p-5">
                <p className="text-sm text-neutral-500">Tugas dan progres akan ditampilkan di sini.</p>
              </div>
            )}

            {activeTab === "audit" && (
              <div className="bg-white rounded-xl border border-sigap-border p-5">
                <h3 className="text-sm font-bold mb-4">Riwayat Audit</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="w-3 h-3 rounded-full bg-sigap-primary"></span>
                      <span className="w-0.5 h-8 bg-neutral-200"></span>
                    </div>
                    <div className="pb-4">
                      <div className="text-sm font-semibold">Laporan dibuat</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {new Date(report.created_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })} · sistem
                      </div>
                    </div>
                  </div>
                  {report.status !== "submitted" && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="w-3 h-3 rounded-full bg-sigap-primary"></span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">Status: {report.status}</div>
                        <div className="font-mono text-xs text-neutral-500">
                          {new Date(report.updated_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <TimelineRail reportId={id ?? ""} />

            <div className="bg-white rounded-xl border border-sigap-border p-5">
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Keputusan</h4>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setDecideDecision("valid");
                    setShowDecideModal(true);
                  }}
                  className="w-full text-sm px-4 py-2 rounded-lg font-semibold text-white text-left transition-opacity"
                  style={{ backgroundColor: colors.primary }}
                >
                  Validasi
                </button>
                <button
                  onClick={() => setShowCombineModal(true)}
                  className="w-full text-sm px-4 py-2 rounded-lg font-semibold border border-sigap-primary text-sigap-primary text-left hover:bg-sigap-primary hover:text-white transition-colors"
                >
                  Gabungkan
                </button>
                <button
                  onClick={() => handleStatusChange("in_progress")}
                  disabled={updatingStatus}
                  className="w-full text-sm px-4 py-2 rounded-lg font-semibold text-white text-left transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: colors.diproses }}
                >
                  {updatingStatus ? "Memproses..." : "Tugaskan ke Petugas"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="sticky bottom-0 z-50 bg-white border-t border-sigap-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-end">
          <button className="text-sm px-5 py-2.5 rounded-lg font-semibold text-white transition-colors" style={{ backgroundColor: colors.primary }}>
            Verifikasi &amp; prioritaskan
          </button>
        </div>
      </div>

      {/* Modals - Same as original */}
      {showDecideModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
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
                    <label className="block text-sm font-medium text-neutral-600 mb-1">
                      ID Surveyor *
                    </label>
                    <input
                      type="text"
                      value={decideSurveyorId}
                      onChange={(e) => setDecideSurveyorId(e.target.value)}
                      placeholder="UUID Surveyor"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">
                      Deadline (opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={decideDeadline}
                      onChange={(e) => setDecideDeadline(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                    />
                  </div>
                </>
              )}

              {decideDecision === "duplicate" && (
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">
                    ID Laporan Utama *
                  </label>
                  <input
                    type="text"
                    value={decideReason}
                    onChange={(e) => setDecideReason(e.target.value)}
                    placeholder="UUID Laporan duplikat"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Alasan (opsional)
                </label>
                <textarea
                  value={decideReason}
                  onChange={(e) => setDecideReason(e.target.value)}
                  placeholder="Alasan keputusan..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium text-neutral-600 hover:bg-neutral-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleDecide}
                disabled={actionLoading || (decideDecision === "needs_survey" && !decideSurveyorId)}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Gabungkan Laporan</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Laporan ini akan digabungkan dengan laporan lain sebagai duplikat.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  ID Laporan Target *
                </label>
                <input
                  type="text"
                  value={combineTargetId}
                  onChange={(e) => setCombineTargetId(e.target.value)}
                  placeholder="UUID Laporan target"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Alasan
                </label>
                <textarea
                  value={combineReason}
                  onChange={(e) => setCombineReason(e.target.value)}
                  placeholder="Alasan penggabungan..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium text-neutral-600 hover:bg-neutral-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleCombine}
                disabled={actionLoading || !combineTargetId}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Pisahkan Laporan</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Laporan ini akan dipisahkan menjadi dua laporan.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Deskripsi Laporan Baru *
                </label>
                <textarea
                  value={separateDescription}
                  onChange={(e) => setSeparateDescription(e.target.value)}
                  placeholder="Deskripsi untuk laporan baru (minimal 10 karakter)..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Alasan
                </label>
                <textarea
                  value={separateReason}
                  onChange={(e) => setSeparateReason(e.target.value)}
                  placeholder="Alasan pemisahan..."
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium text-neutral-600 hover:bg-neutral-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleSeparate}
                disabled={actionLoading || separateDescription.length < 10}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Tolak Laporan</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Laporan ini akan ditolak. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Alasan Penolakan *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Alasan penolakan (minimal 10 karakter)..."
                rows={3}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium text-neutral-600 hover:bg-neutral-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || rejectReason.length < 10}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Verifikasi completion</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-2">
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
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Catatan (opsional)
                </label>
                <textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Catatan verifikasi..."
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Alasan (opsional)
                </label>
                <textarea
                  value={verifyReason}
                  onChange={(e) => setVerifyReason(e.target.value)}
                  placeholder="Alasan keputusan..."
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium text-neutral-600 hover:bg-neutral-100 transition-opacity"
              >
                Batal
              </button>
              <button
                onClick={handleVerifyCompletion}
                disabled={actionLoading}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Kirim Verifikasi RT/RW</h3>

            {!rtRwMagicLink ? (
              <>
                <p className="text-sm text-neutral-600 mb-4">
                  Masukkan ID User RT/RW untuk mengirim tautan verifikasi.
                </p>
                <input
                  type="text"
                  value={rtRwUserId}
                  onChange={(e) => setRtRwUserId(e.target.value)}
                  placeholder="ID User RT/RW"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-4 text-sm"
                />
                {rtRwError && (
                  <p className="text-sm text-danger-500 mb-4">{rtRwError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeRtRwModal}
                    className="text-sm px-4 py-2 rounded-lg font-medium text-neutral-600 hover:bg-neutral-100 transition-opacity"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSendRtRwVerification}
                    disabled={rtRwLoading || !rtRwUserId.trim()}
                    className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: colors.primary }}
                  >
                    {rtRwLoading ? "Mengirim..." : "Kirim"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-600 mb-4">
                  Tautan verifikasi berhasil dibuat:
                </p>
                <div className="bg-neutral-50 rounded-lg p-3 mb-4 break-all">
                  <a
                    href={rtRwMagicLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {rtRwMagicLink}
                  </a>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeRtRwModal}
                    className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-opacity"
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
