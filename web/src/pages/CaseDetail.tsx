import { ReportSelector } from "../components/RecordSelectors";
import { AIAssessmentViewer } from "../components/AIAssessmentViewer";
import { AssessmentSummary } from "../components/AssessmentResultDetails";
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type {
  ReportStatus,
  Report,
  AgentAssessment,
  PriorityResponse,
  SurveyVisit,
  DuplicateCandidate,
} from "../types";
import { Audit } from "./Audit";
import Tasks from "./Tasks";
import { MapView } from "../components/MapView";
import { PageHead } from "../components/ReferencePage";
import { StatusBadge } from "../components/StatusBadge";

import { TimelineRail } from "../components/case-detail/TimelineRail";
import { api, request } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { colors, extendedColors, fontFamilies } from "../theme/tokens";
import { logger } from "@/lib/logger";
import { SigapCard } from "../components/design-system/Card";
import { StickyActionBar } from "../components/design-system";
import { PriorityScorePanel } from "../components";
import { DuplicateComparisonModal } from "../components";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import { useCategoryOptions } from "../hooks/useCategoryOptions";

const singleMarkerIcon = L.divIcon({
  className: "custom-div-icon",
  html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${colors.perluTindakan}; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

type DecisionType =
  | "valid"
  | "needs_completion"
  | "needs_survey"
  | "duplicate"
  | "out_of_scope"
  | "rejected";
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

export const CaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [assessments, setAssessments] = useState<AgentAssessment[]>([]);
  const [visits, setVisits] = useState<SurveyVisit[]>([]);
  const [priority, setPriority] = useState<PriorityResponse | null>(null);
  const { rawCategories: categories } = useCategoryOptions();
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
  const [showVerifyCompletionModal, setShowVerifyCompletionModal] =
    useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [decideDecision, setDecideDecision] = useState<DecisionType | "">("");
  const [decideReason, setDecideReason] = useState("");
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusChoice, setStatusChoice] = useState<ReportStatus>("submitted");
  const [statusReason, setStatusReason] = useState("");
  const [decideDuplicateId, setDecideDuplicateId] = useState("");
  const [decideSurveyorId, setDecideSurveyorId] = useState("");
  const [decideDeadline, setDecideDeadline] = useState("");
  const [decideUnitId, setDecideUnitId] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignUnits, setAssignUnits] = useState<
    Array<{ id: string; nama: string; type: "unit" | "user" }>
  >([]);
  const [assignUnitsLoading, setAssignUnitsLoading] = useState(false);
  const [assignSelectedUnitId, setAssignSelectedUnitId] = useState("");
  const [assignTaskType, setAssignTaskType] = useState<
    "survei_verifikasi" | "perbaikan_fisik"
  >("perbaikan_fisik");
  const [assignDeadline, setAssignDeadline] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [surveyors, setSurveyors] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [surveyorsLoading, setSurveyorsLoading] = useState(false);
  const [surveyorsError, setSurveyorsError] = useState("");
  useEffect(() => {
    if (!showDecideModal || decideDecision !== "needs_survey") return;
    let active = true;
    setSurveyorsLoading(true);
    setSurveyorsError("");
    api
      .users({ role: "PETUGAS", limit: 100, is_active: true })
      .then((result) => {
        if (active) setSurveyors(result.data.filter((user) => !user.disabled));
      })
      .catch(() => {
        if (active)
          setSurveyorsError(
            "Daftar petugas belum dapat dimuat. Tutup dan buka kembali formulir untuk mencoba lagi.",
          );
      })
      .finally(() => {
        if (active) setSurveyorsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showDecideModal, decideDecision]);

  const openActionModal = (action: "combine" | "verify") => {
    if (action === "combine") setShowCombineModal(true);
    if (action === "verify") {
      setDecideDecision("valid");
      setShowDecideModal(true);
    }
  };
  const [combineTargetId, setCombineTargetId] = useState("");
  const [combineReason, setCombineReason] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<Report[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [separateDescription, setSeparateDescription] = useState("");
  const [separateReason, setSeparateReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [verifyDecision, setVerifyDecision] = useState<"approved" | "rejected">(
    "approved",
  );
  const [verifyReason, setVerifyReason] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("ringkasan");
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);
  const assessmentRequest = useRef(0);
  const [visitsError, setVisitsError] = useState<string | null>(null);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] =
    useState<DuplicateCandidate | null>(null);
  const user = useAuthStore((s) => s.user);
  const isPetugas = user?.role === "PETUGAS";
  useEffect(() => {
    if (!showCombineModal || !report) return;
    let active = true;
    setMergeLoading(true);
    setMergeError("");
    api
      .reports({ category_id: report.category_id, limit: 100 })
      .then(async (first) => {
        const rest = await Promise.all(
          Array.from(
            { length: Math.max(0, first.pagination.total_pages - 1) },
            (_, i) =>
              api.reports({
                category_id: report.category_id,
                limit: 100,
                page: i + 2,
              }),
          ),
        );
        const candidates = [
          ...first.data,
          ...rest.flatMap((p) => p.data),
        ].filter(
          (item) =>
            item.id !== report.id &&
            !["merged", "closed", "rejected", "separated"].includes(
              item.status,
            ),
        );
        if (active) {
          setMergeCandidates(candidates);
          setCombineTargetId(candidates[0]?.id || "");
        }
      })
      .catch((e: Error) => {
        if (active) setMergeError(e.message);
      })
      .finally(() => {
        if (active) setMergeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showCombineModal, report?.id, report?.category_id]);

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
    const requestId = ++assessmentRequest.current;
    try {
      const res = await api.reportAssessments(id);
      if (requestId !== assessmentRequest.current) return;
      const items = res.assessments;
      setAssessmentsError(null);
      setAssessments(items);

      const candidates: DuplicateCandidate[] = [];
      for (const a of items) {
        if (a.tool_name === "find_duplicates" && a.result.candidates) {
          candidates.push(...a.result.candidates);
        }
      }
      setDuplicateCandidates(candidates);
    } catch (e) {
      if (requestId !== assessmentRequest.current) return;
      logger.error("Gagal memuat penilaian AI", { error: e, reportId: id });
      setAssessmentsError("Gagal memuat data penilaian AI");
      setAssessments([]);
      setDuplicateCandidates([]);
    }
  };

  const loadVisits = async () => {
    if (!id) return;
    try {
      const res = await api.getCase(id);
      setVisits(res.visits);
    } catch (e) {
      logger.error("Gagal memuat kunjungan lapangan", {
        error: e,
        reportId: id,
      });
      setVisitsError("Gagal memuat data kunjungan lapangan");
      setVisits([]);
    }
  };

  const loadPriority = async () => {
    if (!id) return;
    try {
      const p = await api.reportPriority(id);
      setPriority(p);
    } catch (e) {
      logger.error("Gagal memuat data prioritas", { error: e, reportId: id });
      setPriority(null);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    let active = true;
    setAddress(report?.address_area ?? null);
    if (
      report &&
      !report.address_area &&
      report.lat != null &&
      report.lng != null
    ) {
      api
        .geocodeReverse(report.lat, report.lng)
        .then((geo) => {
          if (active && geo?.address) setAddress(geo.address);
        })
        .catch((e) => {
          logger.warn("Geocode reverse failed", { error: e });
        });
    }
    return () => {
      active = false;
    };
  }, [report?.id, report?.lat, report?.lng, report?.address_area]);

  useEffect(() => {
    if (report) {
      loadAssessments();
      loadPriority();
      loadVisits();
    }
  }, [report]);

  const handleAssess = async () => {
    if (!report) return;
    setAssessing(true);
    setAssessmentsError(null);
    try {
      await api.assess({
        report_id: report.id,
        assessment_kind: "initial",
      });
      await loadAssessments();
      await loadPriority();
    } catch (e) {
      logger.error("Failed to assess report", { error: e });
      setAssessmentsError(
        e instanceof Error ? e.message : "Penilaian AI gagal",
      );
    } finally {
      setAssessing(false);
    }
  };

  const handleStatusChange = async (newStatus: ReportStatus) => {
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
      const body: {
        reason?: string;
        assigned_unit_id?: string;
        deadline?: string;
      } = { reason: "" };
      if (decideUnitId) body.assigned_unit_id = decideUnitId;
      if (decideDeadline) body.deadline = decideDeadline;
      await api.acceptCase(report.id, body);
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to accept case", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusDecision = async () => {
    if (!report || statusReason.trim().length < 5) return;
    setActionLoading(true);
    try {
      await api.updateReport(report.id, {
        status: statusChoice,
        reason: statusReason.trim(),
      });
      await load();
      closeAllModals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecide = async () => {
    if (!report || !decideDecision || decideReason.trim().length < 5) return;
    if (decideDecision === "duplicate" && !decideDuplicateId) return;
    if (decideDecision === "needs_survey" && !decideSurveyorId) return;
    setActionLoading(true);
    try {
      const body: {
        decision: DecisionType;
        reason: string;
        duplicate_of_report_id?: string;
        surveyor_id?: string;
        deadline?: string;
      } = { decision: decideDecision, reason: decideReason ?? "" };
      if (decideDecision === "needs_survey" && decideSurveyorId)
        body.surveyor_id = decideSurveyorId;
      if (decideDecision === "needs_survey" && decideDeadline)
        body.deadline = decideDeadline;
      if (decideDecision === "duplicate")
        body.duplicate_of_report_id = decideDuplicateId;
      await api.decideCase(report.id, body);
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
    if (!report || !combineTargetId || combineReason.trim().length < 5) return;
    setActionLoading(true);
    try {
      await api.combineCases(combineTargetId, {
        target_case_id: report.id,
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
      await api.separateCase(report.id, {
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
      await api.rejectCase(report.id, { reason: rejectReason });
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
      const body: {
        decision: "approved" | "rejected";
        reason?: string;
        completion_notes?: string;
      } = {
        decision: verifyDecision,
      };
      if (verifyReason) body.reason = verifyReason;
      if (verifyNotes) body.completion_notes = verifyNotes;
      await api.verifyCompletion(report.id, body);
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
  const handleOverridePriority = async () => {
    if (
      !report ||
      overrideScore === "" ||
      !Number.isFinite(Number(overrideScore)) ||
      Number(overrideScore) < 0 ||
      Number(overrideScore) > 100 ||
      overrideReason.trim().length < 5
    )
      return;
    setActionLoading(true);
    try {
      await api.setCasePriority(report.id, {
        score: Number(overrideScore),
        reason: overrideReason.trim(),
      });
      await load();
      await loadPriority();
      closeAllModals();
    } catch (e) {
      logger.error("Failed to override priority", { error: e });
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!report || !escalateReason.trim()) return;
    setActionLoading(true);
    try {
      const { toast } = await import("../components/Toast");
      await api.escalateReport(report.id, escalateReason.trim());
      toast.success("Laporan berhasil dieskalasi");
      setShowEscalateModal(false);
      setEscalateReason("");
      await load();
      await loadPriority();
    } catch (e) {
      const { toast } = await import("../components/Toast");
      logger.error("Failed to escalate report", { error: e });
      toast.error((e as Error).message || "Gagal mengeskalsi laporan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCase = async () => {
    if (!report) return;
    try {
      const blob = await api.exportPdf({ report_id: report.id });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kasus-${report.id}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      logger.error("Gagal ekspor kasus", { error: e });
      setError("Gagal mengekspor kasus");
    }
  };

  const handleOpenAssignModal = async () => {
    if (!report) return;
    setAssignTaskType(
      activeTab === "verifikasi" ? "survei_verifikasi" : "perbaikan_fisik",
    );
    setAssignReason("");
    setAssignDeadline("");
    setShowAssignModal(true);
    setAssignError(null);
    setAssignSelectedUnitId("");
    setAssignUnitsLoading(true);
    try {
      const [res, people] = await Promise.all([
        api.units(),
        api.users({ role: "PETUGAS", limit: 100, is_active: true }),
      ]);
      setAssignUnits([
        ...res.items
          .filter((u) => u.is_active)
          .map((u) => ({ id: u.id, nama: u.nama, type: "unit" as const })),
        ...people.data
          .filter((u) => !u.disabled)
          .map((u) => ({ id: u.id, nama: u.name, type: "user" as const })),
      ]);
    } catch (e) {
      logger.error("Gagal memuat daftar unit", { error: e });
      setAssignError("Gagal memuat daftar unit");
    } finally {
      setAssignUnitsLoading(false);
    }
  };

  const handleAssignUnit = async () => {
    if (
      !report ||
      !assignSelectedUnitId ||
      !assignDeadline ||
      assignReason.trim().length < 5
    )
      return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.assignCase(report.id, {
        assigned_unit_id: assignSelectedUnitId,
        assignee_type:
          assignUnits.find((unit) => unit.id === assignSelectedUnitId)?.type ??
          "unit",
        task_type: assignTaskType,
        deadline: new Date(assignDeadline + "T23:59:00+07:00").toISOString(),
        instructions: assignReason.trim(),
        reason: assignReason.trim(),
      });
      setShowAssignModal(false);
      await load();
      await loadPriority();
    } catch (e) {
      logger.error("Gagal menugaskan unit", { error: e });
      setAssignError((e as Error).message || "Gagal menugaskan unit");
    } finally {
      setAssignLoading(false);
    }
  };

  const closeAllModals = () => {
    setShowStatusModal(false);
    setStatusReason("");
    setShowDecideModal(false);
    setShowCombineModal(false);
    setShowSeparateModal(false);
    setShowRejectModal(false);
    setShowVerifyCompletionModal(false);
    setShowOverrideModal(false);
    setDecideDecision("");
    setDecideReason("");
    setDecideSurveyorId("");
    setDecideDuplicateId("");
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
    setOverrideScore("");
    setOverrideReason("");
    setShowAssignModal(false);
    setAssignSelectedUnitId("");
    setAssignError(null);
  };

  const closeRtRwModal = () => {
    setShowRtRwModal(false);
    setRtRwUserId("");
    setRtRwMagicLink(null);
    setRtRwError(null);
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAllModals();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Memuat...
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Laporan tidak ditemukan.
        </p>
      </div>
    );
  }

  const isTerminal = [
    "resolved",
    "rejected",
    "closed",
    "duplicate_merged",
    "merged",
    "separated",
    "out_of_scope",
  ].includes(report.status);
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

  const openStreetMapUrl =
    report.lat != null && report.lng != null
      ? `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}&zoom=16`
      : null;

  const getPriorityColor = (level: string) => {
    switch (level) {
      case "Kritis":
        return colors.perluTindakan;
      case "Tinggi":
        return colors.warning;
      case "Sedang":
        return colors.diproses;
      case "Rendah":
        return colors.selesai;
      default:
        return colors.textMuted;
    }
  };

  const getPriorityBgColor = (level: string) => {
    switch (level) {
      case "Kritis":
        return "bg-danger-100";
      case "Tinggi":
        return "bg-warning-100";
      case "Sedang":
        return "bg-info-100";
      case "Rendah":
        return "bg-primary-50";
      default:
        return "bg-neutral-100";
    }
  };

  const getPriorityTextColor = (level: string) => {
    switch (level) {
      case "Kritis":
        return "text-danger-600";
      case "Tinggi":
        return "text-warning-600";
      case "Sedang":
        return "text-info-600";
      case "Rendah":
        return "text-primary-700";
      default:
        return "text-neutral-500";
    }
  };

  const getVariantStyle = (variant?: string) => {
    switch (variant) {
      case "primary":
        return { backgroundColor: colors.primary };
      case "danger":
        return { backgroundColor: colors.perluTindakan };
      case "warning":
        return { backgroundColor: colors.warning };
      case "info":
        return { backgroundColor: colors.diproses };
      default:
        return { backgroundColor: colors.primary };
    }
  };

  const tabs = [
    { id: "ringkasan" as TabType, label: "Ringkasan" },
    { id: "bukti" as TabType, label: "Bukti & Laporan" },
    { id: "verifikasi" as TabType, label: "Verifikasi" },
    { id: "tugas" as TabType, label: "Tugas & Progres" },
    { id: "audit" as TabType, label: "Riwayat Audit" },
  ];

  const scorePanel = (
    <PriorityScorePanel
      score={priority?.score ?? null}
      breakdown={[
        {
          label: "Keselamatan",
          value: priority?.breakdown?.severity,
          max: 40,
          color: colors.primary,
        },
        {
          label: "Warga terdampak",
          value: priority?.breakdown?.affected_residents,
          max: 40,
          color: colors.primary,
        },
        ...(priority?.breakdown?.report_count != null
          ? [
              {
                label: "Laporan pendukung",
                value: priority?.breakdown.report_count,
                max: 40,
                color: colors.primary,
              },
            ]
          : []),
        {
          label: "Batas waktu SLA",
          value: priority?.breakdown?.sla_pressure,
          max: 40,
          color: colors.warning,
        },
      ].filter(
        (part): part is typeof part & { value: number } => part.value != null,
      )}
      {...(priority?.version != null
        ? { modelVersion: String(priority.version) }
        : {})}
      {...(user?.role === "ADMIN"
        ? {
            onOverride: () => {
              setOverrideScore(String(priority?.score ?? ""));
              setShowOverrideModal(true);
            },
          }
        : {})}
    />
  );

  const evidenceReports = [
    {
      id: report.id,
      title: report.title,
      description: report.description,
      photo_urls: report.photo_urls,
      created_at: report.created_at,
    },
    ...(report.supporting_reports ?? []),
  ];
  const evidenceGallery = (
    <section className="ref-card">
      <div className="ref-card-head">
        <h2>
          {activeTab === "bukti"
            ? `${evidenceReports.length} laporan pendukung terkonsolidasi`
            : "Laporan pendukung"}
        </h2>
        {user?.role === "ADMIN" && (
          <button
            className="ref-button"
            onClick={() => setShowCombineModal(true)}
          >
            Bandingkan kandidat duplikat
          </button>
        )}
      </div>
      <div className="ref-evidence-gallery">
        {evidenceReports.flatMap((item) =>
          item.photo_urls?.length
            ? item.photo_urls.map((url, index) => (
                <figure key={item.id + url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`Bukti ${item.id} foto ${index + 1}`} />
                  </a>
                  <figcaption>
                    Bukti {index + 1} · {item.id}
                  </figcaption>
                </figure>
              ))
            : [
                <figure key={item.id}>
                  <div className="ref-empty" style={{ height: 150 }}>
                    Belum ada foto bukti
                  </div>
                  <figcaption>{item.id}</figcaption>
                </figure>,
              ],
        )}
      </div>
      {activeTab === "bukti" && (
        <p style={{ marginTop: 20 }}>{report.description}</p>
      )}
    </section>
  );

  return (
    <div className="ref-case-detail">
      <div
        className="flex items-center gap-2 text-sm"
        style={{ marginBottom: 15 }}
      >
        <Link to="/system/cases" className="text-sigap-primary">
          Peta &amp; Kasus /
        </Link>
        <span className="font-mono text-sigap-textMuted">{report.id}</span>
      </div>
      <PageHead
        title={report.title || report.description}
        subtitle={`${report.address_area || address || report.village_name || report.kelurahan || "Alamat belum tercatat"}${report.supporting_count ? `. ${report.supporting_count} laporan lain telah digabungkan ke laporan ini.` : ""}`}
        actions={
          user?.role === "ADMIN" ? (
            <>
              <button
                className="ref-button"
                onClick={() => openActionModal("combine")}
              >
                Gabungkan Kasus
              </button>
              <button
                className="ref-button primary"
                onClick={() => openActionModal("verify")}
              >
                Verifikasi Kasus
              </button>
            </>
          ) : undefined
        }
      />
      <div
        className="flex flex-wrap items-center gap-2"
        style={{ marginBottom: 18 }}
      >
        <StatusBadge
          tone="neutral"
          label={
            categories.find((c) => c.id === report.category_id)?.name ||
            report.category?.name ||
            report.category_id
          }
        />
        <StatusBadge status={report.status} />
        {priority && priority.score >= 80 && (
          <StatusBadge tone="danger" label="Prioritas tinggi" />
        )}
        {report.deadline && (
          <StatusBadge
            tone={
              new Date(report.deadline).getTime() < Date.now() &&
              report.status !== "resolved"
                ? "danger"
                : "neutral"
            }
            label={
              report.status === "resolved"
                ? "Selesai"
                : new Date(report.deadline).getTime() < Date.now()
                  ? "Melewati SLA"
                  : "Dalam SLA"
            }
          />
        )}
      </div>
      <div className="ref-detail-tabs" role="tablist" aria-label="Detail kasus">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 ${activeTab === tab.id ? "border-sigap-primary text-sigap-primary" : "border-transparent text-sigap-textMuted"}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className={
          activeTab === "ringkasan"
            ? "grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5"
            : "grid grid-cols-1 gap-5"
        }
      >
        <div className="space-y-5 min-w-0">
          {error && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: colors.dangerBg,
                color: colors.dangerTextStrong,
                border: `1px solid ${colors.dangerBorder}`,
              }}
            >
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline">
                Tutup
              </button>
            </div>
          )}

          {activeTab === "ringkasan" && (
            <>
              <div className="ref-grid ref-equal">
                <section
                  className="ref-card ref-compact-map"
                  style={{ padding: 10 }}
                >
                  {report.lat != null && report.lng != null ? (
                    <MapView
                      reports={[report]}
                      height="190px"
                      cluster={false}
                      showDrawer={false}
                      publicMap={false}
                    />
                  ) : (
                    <div className="ref-empty" style={{ height: 190 }}>
                      Koordinat belum tersedia
                    </div>
                  )}
                  <div
                    className="flex justify-between items-center gap-2"
                    style={{ padding: "10px 3px 0", fontSize: 10 }}
                  >
                    <span className="font-mono text-sigap-textMuted">
                      {report.lat != null && report.lng != null
                        ? `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`
                        : "—"}
                    </span>
                    <Link to="/system/cases">Buka peta ↗</Link>
                  </div>
                  {address && (
                    <p className="text-sm" style={{ padding: "4px 3px" }}>
                      {address}
                    </p>
                  )}
                </section>
                <section className="ref-card">
                  <div className="ref-eyebrow">DAMPAK MASALAH</div>
                  <h2 style={{ margin: "15px 0" }}>
                    Aktivitas warga terdampak
                  </h2>
                  <p>{report.description}</p>
                  <div className="ref-notice amber" style={{ marginTop: 12 }}>
                    {(() => {
                      const severity = assessments.find(
                        (a) =>
                          a.tool_name === "extract_damage_indicators" &&
                          a.status === "completed",
                      )?.result.severity;
                      const label = severity
                        ? (
                            {
                              low: "ringan",
                              medium: "sedang",
                              high: "berat",
                              critical: "kritis",
                            } as Record<string, string>
                          )[severity]
                        : null;
                      return label
                        ? `Kerusakan yang terlihat pada foto dinilai ${label}. Pemeriksaan keselamatan di lokasi tetap memerlukan temuan lapangan.`
                        : "Foto belum cukup untuk menentukan tingkat kerusakan. Gunakan bukti tambahan atau hasil pemeriksaan lapangan.";
                    })()}{" "}
                  </div>
                </section>
              </div>

              {scorePanel}

              {evidenceGallery}
            </>
          )}

          {activeTab === "bukti" && (
            <div className="space-y-6">{evidenceGallery}</div>
          )}

          {activeTab === "verifikasi" && (
            <div className="ref-grid ref-equal">
              {scorePanel}
              <section className="ref-card">
                <h2>Pertimbangan dari pemeriksaan bukti</h2>
                <p
                  className="text-sm mb-3"
                  style={{ color: colors.textSecondary }}
                >
                  Cocokkan temuan berikut dengan keluhan pelapor. Perhatikan
                  perbedaan antara uraian, foto, dan lokasi sebelum menerima
                  laporan, meminta tambahan bukti, atau menugaskan pemeriksaan
                  lapangan.
                </p>
                {user?.role === "ADMIN" && (
                  <button
                    onClick={handleAssess}
                    disabled={assessing}
                    className="px-4 py-2 rounded-lg text-white text-sm font-semibold mb-4 disabled:opacity-50"
                    style={{ backgroundColor: colors.primary }}
                  >
                    {assessing
                      ? "Menilai laporan…"
                      : assessments.length
                        ? "Jalankan Ulang Penilaian AI"
                        : "Jalankan Penilaian AI"}
                  </button>
                )}
                {assessmentsError && (
                  <div
                    className="mb-3 px-3 py-2 rounded-lg text-xs"
                    style={{
                      backgroundColor: colors.warningBg,
                      color: extendedColors.warningTextStrong,
                      border: `1px solid ${colors.warning}`,
                    }}
                  >
                    {assessmentsError}
                  </div>
                )}
                <div className="space-y-3">
                  {assessments.length === 0 ? (
                    <AIAssessmentViewer assessment={null} />
                  ) : (
                    <>
                      <AssessmentSummary assessments={assessments} />
                      <details className="text-sm">
                        <summary className="cursor-pointer font-semibold">
                          Lihat rincian pemeriksaan AI
                        </summary>
                        <div className="space-y-3 mt-3">
                          {assessments.map((a) => (
                            <AIAssessmentViewer key={a.id} assessment={a} />
                          ))}
                        </div>
                      </details>
                    </>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap mt-5">
                  <button
                    className="ref-button primary"
                    onClick={() => openActionModal("verify")}
                  >
                    Verifikasi &amp; Prioritaskan
                  </button>
                  <button
                    className="ref-button"
                    onClick={handleOpenAssignModal}
                  >
                    Tugaskan pemeriksaan lapangan
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === "tugas" && <Tasks reportId={report.id} />}
          {activeTab === "audit" && <Audit reportId={report.id} />}
        </div>

        {activeTab === "ringkasan" && (
          <div className="space-y-5">
            <TimelineRail reportId={id ?? ""} />

            <div className="ref-notice">
              ◈ Perlindungan data warga
              <br />
              Identitas pelapor tidak disertakan dalam portal publik.
            </div>
          </div>
        )}
      </div>

      <div className="ref-case-actionbar">
        <span>
          Aksi kasus: <b className="font-mono">{report.id}</b>
        </span>
        <button
          className="ref-button"
          onClick={() => {
            setStatusChoice(report.status);
            setStatusReason("");
            setShowStatusModal(true);
          }}
        >
          Ubah Status
        </button>
        <button className="ref-button" onClick={handleExportCase}>
          Ekspor Kasus
        </button>
        <button className="ref-button" onClick={handleOpenAssignModal}>
          Tugaskan Unit
        </button>
        <button
          className="ref-button primary"
          onClick={() => openActionModal("verify")}
        >
          Verifikasi &amp; Prioritaskan
        </button>
      </div>

      {showStatusModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white">
            <h3 className="text-[15px] font-bold mb-4">Ubah status kasus</h3>
            <p className="text-sm mb-4">
              {report.id} · {report.title || report.description}
            </p>
            <label className="block text-sm">
              Status baru
              <select
                aria-label="Status baru"
                className="ref-select w-full mt-2"
                value={statusChoice}
                onChange={(e) =>
                  setStatusChoice(e.target.value as ReportStatus)
                }
              >
                {(
                  [
                    { value: "submitted", label: "Menunggu verifikasi" },
                    { value: "verified", label: "Terverifikasi" },
                    { value: "assigned", label: "Menunggu Penugasan" },
                    { value: "in_progress", label: "Sedang Ditangani" },
                    { value: "needs_survey", label: "Perlu Survei Cepat" },
                    { value: "needs_completion", label: "Perlu Kelengkapan" },
                    { value: "resolved", label: "Selesai" },
                    { value: "rejected", label: "Ditolak" },
                  ] satisfies Array<{ value: ReportStatus; label: string }>
                ).map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm mt-4">
              Alasan keputusan
              <textarea
                className="ref-input w-full mt-2"
                aria-label="Alasan perubahan status"
                rows={3}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Jelaskan dasar keputusan agar dapat ditelusuri…"
              />
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button className="ref-button" onClick={closeAllModals}>
                Batal
              </button>
              <button
                className="ref-button primary"
                disabled={actionLoading || statusReason.trim().length < 5}
                onClick={handleStatusDecision}
              >
                {actionLoading ? "Memproses…" : "Simpan keputusan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDecideModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              {decideDecision === "valid" && "Verifikasi kasus"}
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
                    <label
                      className="block text-sm font-medium mb-1"
                      style={{ color: colors.textSecondary }}
                    >
                      Petugas survei *
                    </label>
                    <select
                      aria-label="Petugas survei"
                      disabled={surveyorsLoading}
                      value={decideSurveyorId}
                      onChange={(e) => setDecideSurveyorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        border: `1px solid ${colors.borderNeutral}`,
                        color: colors.textPrimary,
                      }}
                    >
                      <option value="">
                        {surveyorsLoading ? "Memuat petugas…" : "Pilih petugas"}
                      </option>
                      {surveyors.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                    {surveyorsError && <p role="alert">{surveyorsError}</p>}
                    {!surveyorsLoading &&
                      !surveyorsError &&
                      surveyors.length === 0 && <p>Belum ada petugas aktif.</p>}
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      style={{ color: colors.textSecondary }}
                    >
                      Deadline (opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={decideDeadline}
                      onChange={(e) => setDecideDeadline(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        border: `1px solid ${colors.borderNeutral}`,
                        color: colors.textPrimary,
                      }}
                    />
                  </div>
                </>
              )}

              {decideDecision === "duplicate" && (
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: colors.textSecondary }}
                  >
                    Laporan utama *
                  </label>
                  <ReportSelector
                    value={decideDuplicateId}
                    onChange={setDecideDuplicateId}
                    excludeId={report.id}
                  />
                </div>
              )}

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Alasan keputusan
                </label>
                <textarea
                  value={decideReason}
                  onChange={(e) => setDecideReason(e.target.value)}
                  placeholder="Alasan keputusan..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${colors.borderNeutral}`,
                    color: colors.textPrimary,
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
              >
                Batal
              </button>
              <button
                onClick={handleDecide}
                disabled={
                  actionLoading ||
                  decideReason.trim().length < 5 ||
                  (decideDecision === "duplicate" && !decideDuplicateId) ||
                  (decideDecision === "needs_survey" && !decideSurveyorId)
                }
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
          className="fixed inset-0 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="bg-white">
            <h3 className="text-[15px] font-bold mb-4">
              Bandingkan &amp; gabungkan kasus
            </h3>
            <p className="text-sm mb-4">
              {report.id} · {report.title || report.description}
            </p>
            {mergeLoading ? (
              <p>Memuat kandidat…</p>
            ) : mergeError ? (
              <p role="alert">{mergeError}</p>
            ) : !mergeCandidates.length ? (
              <p>Tidak ada kasus lain dalam kategori yang sama.</p>
            ) : (
              <>
                <label className="block text-sm">
                  Gabungkan kandidat berikut ke {report.id}
                  <select
                    className="ref-select w-full mt-2"
                    aria-label="Kandidat penggabungan"
                    value={combineTargetId}
                    onChange={(e) => setCombineTargetId(e.target.value)}
                  >
                    {mergeCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.id} ·{" "}
                        {candidate.title || candidate.description}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ref-grid ref-equal my-4">
                  {[
                    report,
                    mergeCandidates.find((item) => item.id === combineTargetId),
                  ]
                    .filter((item): item is Report => !!item)
                    .map((item) => (
                      <section className="ref-card" key={item.id}>
                        <h3 className="text-xs font-bold">{item.id}</h3>
                        {item.photo_urls[0] ? (
                          <img
                            className="w-full rounded-lg my-3"
                            style={{ aspectRatio: 1.8, objectFit: "cover" }}
                            src={item.photo_urls[0]}
                            alt={`Bukti pembanding ${item.id}`}
                          />
                        ) : (
                          <div className="ref-empty">Belum ada foto bukti</div>
                        )}
                        <p>{item.title || item.description}</p>
                        <small>
                          {item.kelurahan ||
                            item.village_name ||
                            "Desa belum tercatat"}
                        </small>
                      </section>
                    ))}
                </div>
                <label className="block text-sm">
                  Alasan keputusan
                  <textarea
                    className="ref-input w-full mt-2"
                    aria-label="Alasan penggabungan"
                    rows={3}
                    value={combineReason}
                    onChange={(e) => setCombineReason(e.target.value)}
                    placeholder="Jelaskan dasar keputusan agar dapat ditelusuri…"
                  />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button className="ref-button" onClick={closeAllModals}>
                Batal
              </button>
              <button
                className="ref-button primary"
                disabled={
                  actionLoading ||
                  mergeLoading ||
                  !combineTargetId ||
                  combineReason.trim().length < 5
                }
                onClick={handleCombine}
              >
                {actionLoading ? "Memproses…" : "Konfirmasi Penggabungan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicateModal && selectedDuplicate && report && (
        <DuplicateComparisonModal
          original={{
            report_id: report.id,
            description: report.description,
            created_at: report.created_at,
            distance_m: 0,
          }}
          duplicate={selectedDuplicate}
          onMerge={(targetId) => {
            setCombineTargetId(targetId);
            setShowDuplicateModal(false);
            setShowCombineModal(false);
            handleCombine();
          }}
          onClose={() => {
            setShowDuplicateModal(false);
            setSelectedDuplicate(null);
          }}
        />
      )}

      {showSeparateModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              Pisahkan Laporan
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Laporan ini akan dipisahkan menjadi dua laporan.
            </p>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Deskripsi Laporan Baru *
                </label>
                <textarea
                  value={separateDescription}
                  onChange={(e) => setSeparateDescription(e.target.value)}
                  placeholder="Deskripsi untuk laporan baru (minimal 10 karakter)..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${colors.borderNeutral}`,
                    color: colors.textPrimary,
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Alasan
                </label>
                <textarea
                  value={separateReason}
                  onChange={(e) => setSeparateReason(e.target.value)}
                  placeholder="Alasan pemisahan..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${colors.borderNeutral}`,
                    color: colors.textPrimary,
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
              >
                Batal
              </button>
              <button
                onClick={handleSeparate}
                disabled={
                  actionLoading || (separateDescription?.length ?? 0) < 10
                }
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
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              Tolak Laporan
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Laporan ini akan ditolak. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: colors.textSecondary }}
              >
                Alasan Penolakan *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Alasan penolakan (minimal 10 karakter)..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  border: `1px solid ${colors.borderNeutral}`,
                  color: colors.textPrimary,
                }}
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || (rejectReason?.length ?? 0) < 10}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.perluTindakan }}
              >
                {actionLoading ? "Memproses..." : "Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerifyCompletionModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              Verifikasi completion
            </h3>
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
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Catatan (opsional)
                </label>
                <textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Catatan verifikasi..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${colors.borderNeutral}`,
                    color: colors.textPrimary,
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Alasan (opsional)
                </label>
                <textarea
                  value={verifyReason}
                  onChange={(e) => setVerifyReason(e.target.value)}
                  placeholder="Alasan keputusan..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${colors.borderNeutral}`,
                    color: colors.textPrimary,
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
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

      {showOverrideModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              Override skor prioritas
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm">
                  Skor prioritas baru (0–100)
                  <input
                    className="ref-input w-full mt-2"
                    aria-label="Skor prioritas baru"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Alasan *
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Masukkan alasan override..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${colors.borderNeutral}`,
                    color: colors.textPrimary,
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
              >
                Batal
              </button>
              <button
                onClick={handleOverridePriority}
                disabled={
                  actionLoading ||
                  overrideScore === "" ||
                  Number(overrideScore) < 0 ||
                  Number(overrideScore) > 100 ||
                  overrideReason.trim().length < 5
                }
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.warning }}
              >
                {actionLoading ? "Memproses..." : "Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEscalateModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEscalateModal(false);
              setEscalateReason("");
            }
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              Eskalasi Laporan
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Laporan ini akan dieskalasi ke admin daerah untuk penanganan
              prioritas.
            </p>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: colors.textSecondary }}
              >
                Alasan Eskalasi *
              </label>
              <textarea
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="Alasan eskalasi (minimal 10 karakter)..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  border: `1px solid ${colors.borderNeutral}`,
                  color: colors.textPrimary,
                }}
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => {
                  setShowEscalateModal(false);
                  setEscalateReason("");
                }}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
              >
                Batal
              </button>
              <button
                onClick={handleEscalate}
                disabled={actionLoading || escalateReason.trim().length < 10}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.danger }}
              >
                {actionLoading ? "Memproses..." : "Eskalasi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ backgroundColor: colors.bgCard }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: colors.textPrimary }}
            >
              Tugaskan unit lapangan
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Pilih unit yang akan menangani kasus ini.
            </p>

            <div className="space-y-4">
              <label className="block text-sm">
                Jenis tugas
                <select
                  className="ref-select w-full mt-2"
                  aria-label="Jenis tugas"
                  value={assignTaskType}
                  onChange={(e) =>
                    setAssignTaskType(
                      e.target.value === "survei_verifikasi"
                        ? "survei_verifikasi"
                        : "perbaikan_fisik",
                    )
                  }
                >
                  <option value="survei_verifikasi">Survei Verifikasi</option>
                  <option value="perbaikan_fisik">Perbaikan Fisik</option>
                </select>
              </label>
              <label className="block text-sm">
                Unit / petugas
                <select
                  className="ref-select w-full mt-2"
                  aria-label="Unit / petugas"
                  disabled={assignUnitsLoading}
                  value={assignSelectedUnitId}
                  onChange={(e) => setAssignSelectedUnitId(e.target.value)}
                >
                  <option value="">
                    {assignUnitsLoading
                      ? "Memuat daftar unit..."
                      : "Pilih unit"}
                  </option>
                  {assignUnits.map((unit) => (
                    <option value={unit.id} key={unit.id}>
                      {unit.nama}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Batas penyelesaian
                <input
                  className="ref-input w-full mt-2"
                  aria-label="Batas penyelesaian"
                  type="date"
                  value={assignDeadline}
                  onChange={(e) => setAssignDeadline(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Alasan keputusan
                <textarea
                  className="ref-input w-full mt-2"
                  aria-label="Alasan penugasan"
                  rows={3}
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  placeholder="Jelaskan dasar keputusan agar dapat ditelusuri…"
                />
              </label>
              {assignError && (
                <p className="text-sm text-red-700" role="alert">
                  {assignError}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeAllModals}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity"
                style={{ color: colors.textSecondary }}
              >
                Batal
              </button>
              <button
                onClick={handleAssignUnit}
                disabled={
                  assignLoading ||
                  !assignSelectedUnitId ||
                  assignUnitsLoading ||
                  !assignDeadline ||
                  assignReason.trim().length < 5
                }
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {assignLoading ? "Memproses..." : "Tugaskan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
