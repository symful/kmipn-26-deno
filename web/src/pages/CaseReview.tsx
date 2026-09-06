import { ReportSelector, UnitSelector } from "../components/RecordSelectors";
import { valueLabels } from "../lib/display-labels";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../stores/auth";
import type { PriorityResponse, Report } from "../types";
import { DuplicateComparisonCards } from "../components/DuplicateComparisonCards";
import { logger } from "@/lib/logger";
import { colors, fontFamilies } from "../theme/tokens";

type Decision =
  | "valid"
  | "needs_completion"
  | "needs_survey"
  | "duplicate"
  | "out_of_scope"
  | "rejected";

type CaseData = {
  report: Report;
  assessments: unknown[];
  visits: unknown[];
  audit: unknown[];
};

type CompletionProof = {
  task_id: string;
  petugas_id: string;
  petugas_name?: string;
  summary: string;
  completion_proof: string | null;
  completed_at: string;
  verified?: boolean;
  verified_by?: string;
  verified_at?: string;
  notes?: string;
};

type SanggahanData = {
  filed_at: string;
  filed_by?: string;
  reason?: string;
};

type WorkerOption = { id: string; name: string };

const DECISION_LABELS: Record<Decision, string> = {
  valid: "Valid — setuju & verifikasi",
  needs_completion: "Perlu Kelengkapan",
  needs_survey: "Butuh Survei Lapangan",
  duplicate: "Duplikat",
  out_of_scope: "Di Luar Cakupan",
  rejected: "Ditolak",
};

const DECISION_COLORS: Record<Decision, string> = {
  valid: "bg-selesai hover:bg-selesai",
  needs_completion: "bg-warning-500 hover:bg-warning-600",
  needs_survey: "bg-primary-500 hover:bg-primary-600",
  duplicate: "bg-primary-500 hover:bg-primary-600",
  out_of_scope: "bg-warning-500 hover:bg-warning-600",
  rejected: "bg-danger-500 hover:bg-danger-600",
};

const REASON_MANDATORY: Decision[] = ["out_of_scope", "rejected", "duplicate"];

const LEVEL_COLORS: Record<string, string> = {
  Rendah: colors.selesai,
  Sedang: colors.warning,
  Tinggi: colors.warning,
  Kritis: colors.perluTindakan,
};

const APPEALABLE_STATUSES = ["rejected", "out_of_scope", "needs_completion"];

export default function CaseReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [data, setData] = useState<CaseData | null>(null);
  const [priority, setPriority] = useState<PriorityResponse | null>(null);
  const [completionProof, setCompletionProof] =
    useState<CompletionProof | null>(null);
  const [sanggahan, setSanggahan] = useState<SanggahanData | null>(null);
  const [surveyors, setSurveyors] = useState<WorkerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [decision, setDecision] = useState<Decision | "">("");
  const [reason, setReason] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [surveyorId, setSurveyorId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [assignedUnitId, setAssignedUnitId] = useState("");

  const [overrideScore, setOverrideScore] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [adjustingPriority, setAdjustingPriority] = useState(false);

  const [verifyDecision, setVerifyDecision] = useState<
    "approved" | "rejected" | ""
  >("");
  const [verifyReason, setVerifyReason] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [sanggahanDecision, setSanggahanDecision] = useState<
    "accepted" | "rejected" | ""
  >("");
  const [sanggahanReason, setSanggahanReason] = useState("");
  const [reviewingSanggahan, setReviewingSanggahan] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "review" | "priority" | "completion" | "sanggahan"
  >("review");

  const [duplicates, setDuplicates] = useState<
    Array<{ report_id: string; distance_m: number }>
  >([]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [caseData, priorityData] = await Promise.all([
        api.getCase(id),
        api.reportPriority(id),
      ]);
      setData(caseData);
      setPriority(priorityData);
      setOverrideScore(priorityData.score);

      try {
        const duplicatesData = await api.reportDuplicates(id);
        setDuplicates(
          duplicatesData.candidates.map((c) => ({
            report_id: c.report_id,
            distance_m: c.distance_m,
          })),
        );
      } catch (e) {
        logger.error("Failed to fetch duplicates", { error: e });
        setDuplicates([]);
      }

      const visits = caseData.visits ?? [];
      if ((visits?.length ?? 0) > 0) {
        const lastVisit = visits[visits.length - 1];
        if (lastVisit) {
          setCompletionProof({
            task_id: lastVisit.task_id,
            petugas_id: lastVisit.surveyor_id,
            summary: lastVisit.findings ?? "",
            completion_proof: null,
            completed_at: lastVisit.created_at,
          });
        }
      }

      const report = caseData.report;
      const status = (report.status as string) ?? "";
      if (APPEALABLE_STATUSES.includes(status)) {
        const audit = caseData.audit ?? [];
        const sanggolEvent = audit.find((e) => e.action === "sanggahan_filed");
        if (sanggolEvent) {
          setSanggahan({
            filed_at: sanggolEvent.created_at,
            ...(sanggolEvent.actor ? { filed_by: sanggolEvent.actor } : {}),
          });
        }
      }

      try {
        const usersData = await api.users({ role: "PETUGAS", is_active: true });
        setSurveyors(
          (usersData.data ?? []).map(
            (u: { id: string; name?: string; email: string }) => ({
              id: u.id,
              name: u.name ?? u.email,
            }),
          ),
        );
      } catch (e) {
        logger.error("Failed to fetch petugas", { error: e });
      }
    } catch (e) {
      logger.error("Failed to fetch case review", { error: e });
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canSubmitDecision = (() => {
    if (!decision || submitting) return false;
    if (
      REASON_MANDATORY.includes(decision as Decision) &&
      reason.trim().length < 10
    )
      return false;
    if (decision === "needs_survey" && !surveyorId) return false;
    if (decision === "duplicate" && !duplicateOf) return false;
    return true;
  })();
  async function submitDecision() {
    if (!decision || !id || !canSubmitDecision) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.decideCase(id, {
        decision: decision as Decision,
        reason: reason.trim() || " ",
        ...(decision === "duplicate" && duplicateOf.trim()
          ? { duplicate_of_report_id: duplicateOf.trim() }
          : {}),
        ...(decision === "needs_survey" && surveyorId.trim()
          ? { surveyor_id: surveyorId.trim() }
          : {}),
        ...(decision === "valid" && assignedUnitId.trim()
          ? { assigned_unit_id: assignedUnitId.trim() }
          : {}),
        ...((decision === "valid" || decision === "needs_survey") &&
        deadline.trim()
          ? { deadline: deadline.trim() }
          : {}),
      });
      setReason("");
      setDuplicateOf("");
      setSurveyorId("");
      setDeadline("");
      setAssignedUnitId("");
      setDecision("");
      await load();
    } catch (e) {
      logger.error("Failed to submit decision", { error: e });
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPriorityAdjust() {
    if (!id || ((overrideReason ?? "").trim().length ?? 0) < 10) return;
    setAdjustingPriority(true);
    setError(null);
    try {
      await api.updateReportPriority(id, {
        score: overrideScore,
        reason: overrideReason.trim(),
      });
      setOverrideReason("");
      await load();
    } catch (e) {
      logger.error("Failed to adjust priority", { error: e });
      setError((e as Error).message);
    } finally {
      setAdjustingPriority(false);
    }
  }

  async function submitVerifyCompletion() {
    if (!verifyDecision || !id) return;
    setVerifying(true);
    setError(null);
    try {
      await api.verifyCompletion(id, {
        decision: verifyDecision,
        ...(verifyReason.trim() ? { reason: verifyReason.trim() } : {}),
        ...(verifyNotes.trim() ? { completion_notes: verifyNotes.trim() } : {}),
      });
      setVerifyDecision("");
      setVerifyReason("");
      setVerifyNotes("");
      await load();
    } catch (e) {
      logger.error("Failed to verify completion", { error: e });
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  async function submitSanggahanReview() {
    if (!sanggahanDecision || !id) return;
    setReviewingSanggahan(true);
    setError(null);
    try {
      await api.reviewSanggahan(id, {
        decision: sanggahanDecision,
        ...(sanggahanReason.trim() ? { reason: sanggahanReason.trim() } : {}),
      });
      setSanggahanDecision("");
      setSanggahanReason("");
      await load();
    } catch (e) {
      logger.error("Failed to review sanggahan", { error: e });
      setError((e as Error).message);
    } finally {
      setReviewingSanggahan(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: colors.bgScreen }}>
        <header
          className="px-6 py-4"
          style={{
            backgroundColor: colors.bgCard,
            borderBottom: `1px solid ${colors.borderNeutral}`,
          }}
        >
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <Link
                to="/system/queue"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  border: `1px solid ${colors.borderNeutral}`,
                  color: colors.textPrimary,
                }}
              >
                ←
              </Link>
              <div>
                <h1
                  className="text-lg font-bold tracking-tight"
                  style={{ fontFamily: fontFamilies.sans }}
                >
                  Review Kasus #{id?.slice(0, 8)}
                </h1>
                <p className="text-xs" style={{ color: colors.textTertiary }}>
                  Memuat data laporan...
                </p>
              </div>
            </div>
            <Link
              to="/system/queue"
              className="text-sm font-medium hover:underline"
              style={{ color: colors.primary }}
            >
              ← Kembali ke Antrean
            </Link>
          </div>
        </header>
        <main className="p-6 max-w-4xl mx-auto space-y-4">
          <div
            className="rounded-xl p-8 text-center animate-pulse"
            style={{
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.borderNeutral}`,
            }}
          >
            <div
              className="inline-block w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mb-3"
              style={{
                borderColor: colors.primary,
                borderTopColor: "transparent",
              }}
            />
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              Memuat data review kasus...
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: colors.bgScreen }}>
        <header
          className="px-6 py-4"
          style={{
            backgroundColor: colors.bgCard,
            borderBottom: `1px solid ${colors.borderNeutral}`,
          }}
        >
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <Link
                to="/system/queue"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  border: `1px solid ${colors.borderNeutral}`,
                  color: colors.textPrimary,
                }}
              >
                ←
              </Link>
              <div>
                <h1
                  className="text-lg font-bold tracking-tight"
                  style={{ fontFamily: fontFamilies.sans }}
                >
                  Review Kasus
                </h1>
                <p className="text-xs" style={{ color: colors.danger }}>
                  Gagal memuat data
                </p>
              </div>
            </div>
            <Link
              to="/system/queue"
              className="text-sm font-medium hover:underline"
              style={{ color: colors.primary }}
            >
              ← Kembali ke Antrean
            </Link>
          </div>
        </header>
        <main className="p-6 max-w-4xl mx-auto">
          <div
            className="rounded-xl p-8 text-center"
            style={{
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.borderNeutral}`,
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-xl"
              style={{ backgroundColor: colors.dangerBg, color: colors.danger }}
            >
              ⚠️
            </div>
            <p
              className="text-sm font-medium mb-4"
              style={{ color: colors.danger }}
            >
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: colors.primary }}
            >
              Coba Lagi
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!data) return null;

  const report = data.report as {
    id?: string;
    status?: string;
    category_name?: string;
    description?: string;
    severity?: number;
    photo_urls?: string[];
    created_at?: string;
  };

  const reportStatus = report.status ?? "?";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: colors.bgScreen }}>
      <header
        className="px-6 py-4"
        style={{
          backgroundColor: colors.bgCard,
          borderBottom: `1px solid ${colors.borderNeutral}`,
        }}
      >
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              to="/system/queue"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
              style={{
                border: `1px solid ${colors.borderNeutral}`,
                color: colors.textPrimary,
              }}
            >
              ←
            </Link>
            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ fontFamily: fontFamilies.sans }}
              >
                Review Kasus #{id?.slice(0, 8)}
              </h1>
              <p className="text-xs" style={{ color: colors.textTertiary }}>
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <Link
            to="/system/queue"
            className="text-sm font-medium hover:underline"
            style={{ color: colors.primary }}
          >
            ← Kembali ke Antrean
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="mb-4">
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{
              backgroundColor:
                reportStatus === "verified"
                  ? colors.primaryLight
                  : reportStatus === "under_review"
                    ? colors.infoBg
                    : reportStatus === "needs_completion"
                      ? colors.warningBg
                      : reportStatus === "needs_survey"
                        ? colors.primaryLight
                        : reportStatus === "duplicate_merged"
                          ? colors.primaryLight
                          : reportStatus === "out_of_scope"
                            ? colors.warningBg
                            : reportStatus === "rejected"
                              ? colors.dangerBg
                              : reportStatus === "resolved"
                                ? colors.primaryLight
                                : colors.bgSoft,
              color:
                reportStatus === "verified"
                  ? colors.primaryDark
                  : reportStatus === "under_review"
                    ? colors.infoDark
                    : reportStatus === "needs_completion"
                      ? colors.warningText
                      : reportStatus === "needs_survey"
                        ? colors.primaryDark
                        : reportStatus === "duplicate_merged"
                          ? colors.primaryDark
                          : reportStatus === "out_of_scope"
                            ? colors.warningText
                            : reportStatus === "rejected"
                              ? colors.dangerTextStrong
                              : reportStatus === "resolved"
                                ? colors.primaryDark
                                : colors.textSecondary,
            }}
          >
            {valueLabels[reportStatus] ?? "Belum dapat dinilai"}
          </span>
        </div>

        <div
          className="flex gap-1 mb-4"
          style={{ borderBottom: `1px solid ${colors.borderNeutral}` }}
        >
          {(["review", "priority", "completion", "sanggahan"] as const).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                style={{
                  color:
                    activeTab === tab ? colors.primary : colors.textTertiary,
                  borderColor:
                    activeTab === tab ? colors.primary : "transparent",
                }}
              >
                {tab === "review"
                  ? "Keputusan"
                  : tab === "priority"
                    ? "Prioritas"
                    : tab === "completion"
                      ? "Bukti Penyelesaian"
                      : "Sanggahan"}
              </button>
            ),
          )}
        </div>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg"
            style={{
              backgroundColor: colors.dangerBg,
              border: `1px solid ${colors.dangerBorder}`,
            }}
          >
            <p className="text-sm" style={{ color: colors.danger }}>
              {error}
            </p>
          </div>
        )}

        {activeTab === "review" && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.borderNeutral}`,
              }}
            >
              <p
                className="text-sm font-semibold"
                style={{ color: colors.textPrimary }}
              >
                {report.category_name ?? "Tanpa kategori"}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: colors.textTertiary }}
              >
                Severity: {report.severity ?? "?"}% · Dibuat:{" "}
                {report.created_at
                  ? new Date(report.created_at).toLocaleString("id-ID")
                  : "?"}
              </p>
              {report.description && (
                <p
                  className="text-sm mt-3 whitespace-pre-wrap"
                  style={{ color: colors.textSecondary }}
                >
                  {report.description}
                </p>
              )}
              {Array.isArray(report.photo_urls) &&
                (report.photo_urls?.length ?? 0) > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {(report.photo_urls as string[]).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Bukti ${i + 1}`}
                        className="w-24 h-24 object-cover rounded"
                        style={{ border: `1px solid ${colors.borderNeutral}` }}
                      />
                    ))}
                  </div>
                )}
            </div>

            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.borderNeutral}`,
              }}
            >
              <p
                className="font-semibold mb-2"
                style={{ color: colors.textPrimary }}
              >
                Penilaian AI
              </p>
              {Array.isArray(data.assessments) &&
              (data.assessments?.length ?? 0) > 0 ? (
                <ul className="text-sm space-y-1">
                  {(
                    data.assessments as Array<{
                      assessment_kind?: string;
                      result?: string;
                      created_at?: string;
                    }>
                  ).map((a, i) => (
                    <li key={i} className="text-sigap-textSecondary">
                      {a.assessment_kind ?? "—"}: {a.result ?? "—"} @{" "}
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString("id-ID")
                        : "?"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  Belum ada penilaian AI.
                </p>
              )}
            </div>

            {(duplicates?.length ?? 0) > 0 && (
              <DuplicateComparisonCards
                currentReport={report as import("../types").Report}
                duplicateCandidates={duplicates}
                onMerge={() => load()}
                onKeepSeparate={() => load()}
              />
            )}

            {Array.isArray(data.audit) && (data.audit?.length ?? 0) > 0 && (
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.bgCard,
                  border: `1px solid ${colors.borderNeutral}`,
                }}
              >
                <p
                  className="font-semibold mb-2"
                  style={{ color: colors.textPrimary }}
                >
                  Riwayat Audit
                </p>
                <ul className="text-xs space-y-1">
                  {(
                    data.audit as Array<{
                      action?: string;
                      actor?: string;
                      created_at?: string;
                    }>
                  ).map((e, i) => (
                    <li key={i} style={{ color: colors.textTertiary }}>
                      {new Date(e.created_at ?? "").toLocaleString("id-ID")} —{" "}
                      {e.action} oleh {e.actor ?? "?"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {reportStatus === "submitted" || reportStatus === "under_review" ? (
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.bgCard,
                  border: `1px solid ${colors.borderNeutral}`,
                }}
              >
                <p
                  className="font-semibold mb-3"
                  style={{ color: colors.textPrimary }}
                >
                  Ambil Keputusan
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {(
                    Object.entries(DECISION_LABELS) as [Decision, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDecision(key)}
                      className={`px-3 py-2 rounded text-sm font-medium text-white transition-colors ${
                        decision === key
                          ? DECISION_COLORS[key]
                          : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {decision && (
                  <div className="space-y-3 border-t border-sigap-border pt-3">
                    {decision === "needs_survey" && (
                      <>
                        <div>
                          <label className="block text-sm font-semibold mb-1">
                            Petugas Survei{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={surveyorId}
                            onChange={(e) => setSurveyorId(e.target.value)}
                            className="w-full p-2 border border-sigap-border rounded text-sm"
                          >
                            <option value="">-- Pilih Petugas --</option>
                            {surveyors.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-1">
                            Batas Waktu (deadline)
                          </label>
                          <input
                            type="datetime-local"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className="w-full p-2 border border-sigap-border rounded text-sm"
                          />
                        </div>
                      </>
                    )}

                    {decision === "valid" && (
                      <>
                        <div>
                          <label className="block text-sm font-semibold mb-1">
                            Unit Penerima (opsional)
                          </label>
                          <UnitSelector
                            value={assignedUnitId}
                            onChange={setAssignedUnitId}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-1">
                            Batas Waktu (deadline, opsional)
                          </label>
                          <input
                            type="datetime-local"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className="w-full p-2 border border-sigap-border rounded text-sm"
                          />
                        </div>
                      </>
                    )}

                    {decision === "duplicate" && (
                      <div>
                        <label className="block text-sm font-semibold mb-1">
                          Laporan utama <span className="text-red-500">*</span>
                        </label>
                        <ReportSelector
                          value={duplicateOf}
                          onChange={setDuplicateOf}
                          {...(id ? { excludeId: id } : {})}
                        />
                      </div>
                    )}

                    {(REASON_MANDATORY.includes(decision) || decision) && (
                      <div>
                        <label className="block text-sm font-semibold mb-1">
                          Alasan{" "}
                          {REASON_MANDATORY.includes(decision as Decision)
                            ? "(wajib, min 10 karakter)"
                            : "(opsional)"}
                          :
                        </label>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={
                            decision === "rejected"
                              ? "Jelaskan mengapa laporan ditolak"
                              : decision === "out_of_scope"
                                ? "Jelaskan mengapa di luar cakupan"
                                : decision === "duplicate"
                                  ? "Jelaskan mengapa duplikat"
                                  : "Catatan tambahan"
                          }
                          className="w-full p-2 border border-sigap-border rounded text-sm"
                          rows={3}
                        />
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitDecision}
                  disabled={!canSubmitDecision}
                  className="w-full mt-4 px-4 py-2 bg-primary-500 text-white rounded font-medium disabled:opacity-50 hover:bg-primary-600 transition-colors"
                >
                  {submitting ? "Memproses..." : "Kirim Keputusan"}
                </button>
              </div>
            ) : (
              <div
                className="rounded-lg p-4 text-center"
                style={{
                  backgroundColor: colors.bgSoft,
                  border: `1px solid ${colors.borderNeutral}`,
                }}
              >
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  Kasus sudah dalam status "
                  {valueLabels[reportStatus] ?? "Belum dapat dinilai"}" —
                  keputusan sudahfinal.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate("/system/queue")}
              className="w-full px-4 py-2 rounded font-medium transition-colors"
              style={{
                border: `1px solid ${colors.borderNeutral}`,
                color: colors.textSecondary,
                backgroundColor: colors.bgCard,
              }}
            >
              Kembali ke Antrian
            </button>
          </div>
        )}

        {activeTab === "priority" && priority && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.borderNeutral}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <p
                  className="font-semibold"
                  style={{ color: colors.textPrimary }}
                >
                  Skor Prioritas
                </p>
                <span
                  className="text-xs"
                  style={{ color: colors.textTertiary }}
                >
                  v{priority.version}
                </span>
              </div>

              <div
                className="mb-4 p-3 rounded-lg"
                style={{ backgroundColor: colors.bgSoft }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: colors.textPrimary }}
                  >
                    Skor: {priority.score}
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor:
                        LEVEL_COLORS[priority.level] ?? colors.text,
                      color: "#fff",
                    }}
                  >
                    {priority.level}
                  </span>
                </div>
                <div
                  className="h-3 rounded-full overflow-hidden"
                  style={{ backgroundColor: colors.borderNeutral }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${priority.score}%`,
                      backgroundColor:
                        LEVEL_COLORS[priority.level] ?? colors.textMuted,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <PriorityBar
                  label="Severity"
                  value={priority.breakdown.severity}
                  color={colors.perluTindakan}
                />
                <PriorityBar
                  label="Residents Terdampak"
                  value={priority.breakdown.affected_residents}
                  color={colors.primary}
                />
                <PriorityBar
                  label="Kerentanan Wilayah"
                  value={priority.breakdown.region_vulnerability}
                  color={colors.diproses}
                />
                <PriorityBar
                  label="Tekanan SLA"
                  value={priority.breakdown.sla_pressure}
                  color={colors.warning}
                />
                <PriorityBar
                  label="Faktor Lain"
                  value={priority.breakdown.other_factors}
                  color={colors.diproses}
                />
              </div>
            </div>

            {(reportStatus === "submitted" ||
              reportStatus === "under_review") && (
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.bgCard,
                  border: `1px solid ${colors.borderNeutral}`,
                }}
              >
                <p
                  className="font-semibold mb-3"
                  style={{ color: colors.textPrimary }}
                >
                  Sesuaikan Prioritas
                </p>
                <div className="mb-3">
                  <label className="block text-sm font-semibold mb-1">
                    Skor Override: {overrideScore}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-sigap-textMuted mt-1">
                    <span>0 (Rendah)</span>
                    <span>100 (Kritis)</span>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-semibold mb-1">
                    Alasan Override <span className="text-red-500">*</span> (min
                    10 karakter)
                  </label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Jelaskan mengapa skor disesuaikan..."
                    className="w-full p-2 border border-sigap-border rounded text-sm"
                    rows={3}
                  />
                </div>
                <button
                  type="button"
                  onClick={submitPriorityAdjust}
                  disabled={
                    ((overrideReason ?? "").trim().length ?? 0) < 10 ||
                    adjustingPriority
                  }
                  className="w-full px-4 py-2 bg-primary-500 text-white rounded font-medium disabled:opacity-50 hover:bg-primary-600 transition-colors"
                >
                  {adjustingPriority ? "Menyimpan..." : "Simpan Penyesuaian"}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "completion" && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.borderNeutral}`,
              }}
            >
              <p
                className="font-semibold mb-3"
                style={{ color: colors.textPrimary }}
              >
                Bukti Penyelesaian
              </p>
              {completionProof ? (
                <div className="space-y-3">
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-sm font-medium mb-1">
                      Ringkasan Petugas
                    </p>
                    <p className="text-sm text-sigap-textSecondary whitespace-pre-wrap">
                      {completionProof.summary || "—"}
                    </p>
                  </div>
                  <div className="text-xs text-sigap-textMuted space-y-1">
                    <p>
                      ID Tugas:{" "}
                      <span className="font-mono">
                        {completionProof.task_id}
                      </span>
                    </p>
                    <p>
                      ID Petugas:{" "}
                      <span className="font-mono">
                        {completionProof.petugas_id ||
                          "Menunggu klaim personel"}
                      </span>
                    </p>
                    <p>
                      Diselesaikan:{" "}
                      {completionProof.completed_at
                        ? new Date(completionProof.completed_at).toLocaleString(
                            "id-ID",
                          )
                        : "?"}
                    </p>
                    {completionProof.verified !== undefined && (
                      <p
                        className={`font-semibold ${completionProof.verified ? "text-green-600" : "text-yellow-600"}`}
                      >
                        Status:{" "}
                        {completionProof.verified
                          ? "Disetujui"
                          : "Menunggu verifikasi"}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-sigap-textMuted">
                  {reportStatus === "under_review"
                    ? "Tidak ada bukti penyelesaian yang ditemukan."
                    : "Bukti penyelesaian belum tersedia untuk status ini."}
                </p>
              )}
            </div>

            {reportStatus === "under_review" && (
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.bgCard,
                  border: `1px solid ${colors.borderNeutral}`,
                }}
              >
                <p
                  className="font-semibold mb-3"
                  style={{ color: colors.textPrimary }}
                >
                  Verifikasi Penyelesaian
                </p>
                <div className="mb-3">
                  <label className="block text-sm font-semibold mb-1">
                    Keputusan
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVerifyDecision("approved")}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        verifyDecision === "approved"
                          ? "bg-selesai text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      Setuju / Approved
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerifyDecision("rejected")}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        verifyDecision === "rejected"
                          ? "bg-danger-500 text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      Tolak / Rejected
                    </button>
                  </div>
                </div>
                {verifyDecision === "rejected" && (
                  <div className="mb-3">
                    <label className="block text-sm font-semibold mb-1">
                      Alasan Penolakan <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={verifyReason}
                      onChange={(e) => setVerifyReason(e.target.value)}
                      placeholder="Jelaskan mengapa bukti penyelesaian ditolak..."
                      className="w-full p-2 border border-sigap-border rounded text-sm"
                      rows={3}
                    />
                  </div>
                )}
                <div className="mb-3">
                  <label className="block text-sm font-semibold mb-1">
                    Catatan (opsional)
                  </label>
                  <textarea
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    placeholder="Catatan tambahan untuk petugas..."
                    className="w-full p-2 border border-sigap-border rounded text-sm"
                    rows={2}
                  />
                </div>
                <button
                  type="button"
                  onClick={submitVerifyCompletion}
                  disabled={
                    !verifyDecision ||
                    (verifyDecision === "rejected" &&
                      ((verifyReason ?? "").trim().length ?? 0) < 10) ||
                    verifying
                  }
                  className="w-full px-4 py-2 bg-primary-500 text-white rounded font-medium disabled:opacity-50 hover:bg-primary-600 transition-colors"
                >
                  {verifying ? "Memproses..." : "Kirim Verifikasi"}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "sanggahan" && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.borderNeutral}`,
              }}
            >
              <p
                className="font-semibold mb-3"
                style={{ color: colors.textPrimary }}
              >
                Sanggahan / Obyeksi
              </p>
              {sanggahan ? (
                <div className="p-3 bg-warning-100 border border-warning-100 rounded-lg">
                  <p className="text-sm font-medium text-warning-600 mb-1">
                    Sanggahan telah diajukan
                  </p>
                  <p className="text-xs text-warning-500">
                    Diajukan:{" "}
                    {sanggahan.filed_at
                      ? new Date(sanggahan.filed_at).toLocaleString("id-ID")
                      : "?"}
                    {sanggahan.filed_by && ` oleh ${sanggahan.filed_by}`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-sigap-textMuted">
                  {!APPEALABLE_STATUSES.includes(reportStatus)
                    ? `Status "${valueLabels[reportStatus] ?? "Belum dapat dinilai"}" tidak dapat menerima sanggahan.`
                    : "Tidak ada sanggahan yang diajukan untuk kasus ini."}
                </p>
              )}
            </div>

            {sanggahan && (
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.bgCard,
                  border: `1px solid ${colors.borderNeutral}`,
                }}
              >
                <p
                  className="font-semibold mb-3"
                  style={{ color: colors.textPrimary }}
                >
                  Tinjau Sanggahan
                </p>
                <div className="mb-3">
                  <label className="block text-sm font-semibold mb-1">
                    Keputusan
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSanggahanDecision("accepted")}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        sanggahanDecision === "accepted"
                          ? "bg-selesai text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      Terima Sanggahan
                    </button>
                    <button
                      type="button"
                      onClick={() => setSanggahanDecision("rejected")}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        sanggahanDecision === "rejected"
                          ? "bg-danger-500 text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      Tolak Sanggahan
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-semibold mb-1">
                    Alasan{" "}
                    {sanggahanDecision === "rejected"
                      ? "(wajib)"
                      : "(opsional)"}
                    :
                  </label>
                  <textarea
                    value={sanggahanReason}
                    onChange={(e) => setSanggahanReason(e.target.value)}
                    placeholder={
                      sanggahanDecision === "accepted"
                        ? "Catatan mengapa sanggahan diterima..."
                        : "Jelaskan mengapa sanggahan ditolak..."
                    }
                    className="w-full p-2 border border-sigap-border rounded text-sm"
                    rows={3}
                  />
                </div>
                <button
                  type="button"
                  onClick={submitSanggahanReview}
                  disabled={
                    !sanggahanDecision ||
                    (sanggahanDecision === "rejected" &&
                      ((sanggahanReason ?? "").trim().length ?? 0) < 10) ||
                    reviewingSanggahan
                  }
                  className="w-full px-4 py-2 bg-primary-500 text-white rounded font-medium disabled:opacity-50 hover:bg-primary-600 transition-colors"
                >
                  {reviewingSanggahan
                    ? "Memproses..."
                    : "Kirim Tinjauan Sanggahan"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

type PriorityBarProps = {
  label: string;
  value: number;
  color: string;
};

function PriorityBar({ label, value, color }: PriorityBarProps) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-sm w-36 flex-shrink-0"
        style={{ color: colors.textSecondary }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.bgSoft }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="text-xs font-medium w-10 text-right"
        style={{ color: colors.textMuted }}
      >
        {percent}%
      </span>
    </div>
  );
}
