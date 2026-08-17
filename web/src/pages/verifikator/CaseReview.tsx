import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import type { PriorityResponse } from "../../types";
import { DuplicateComparisonCards } from "../../components/DuplicateComparisonCards";
import { logger } from "@/lib/logger";
import { colors } from "../../theme/tokens";

type Decision = "valid" | "needs_completion" | "needs_survey" | "duplicate" | "out_of_scope" | "rejected";

type CaseData = {
  report: Record<string, unknown>;
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

type SurveyorOption = { id: string; name: string };

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
  const [completionProof, setCompletionProof] = useState<CompletionProof | null>(null);
  const [sanggahan, setSanggahan] = useState<SanggahanData | null>(null);
  const [surveyors, setSurveyors] = useState<SurveyorOption[]>([]);
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

  const [verifyDecision, setVerifyDecision] = useState<"approved" | "rejected" | "">("");
  const [verifyReason, setVerifyReason] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [sanggahanDecision, setSanggahanDecision] = useState<"accepted" | "rejected" | "">("");
  const [sanggahanReason, setSanggahanReason] = useState("");
  const [reviewingSanggahan, setReviewingSanggahan] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"review" | "priority" | "completion" | "sanggahan">("review");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [caseData, priorityData] = await Promise.all([
        api.verifikatorCase(id),
        api.reportPriority(id),
      ]);
      setData(caseData);
      setPriority(priorityData);
      setOverrideScore(priorityData.score);

      const visits = (caseData as { visits?: unknown[] }).visits ?? [];
      if (visits.length > 0) {
        const lastVisit = visits[visits.length - 1] as Record<string, unknown>;
        if (lastVisit) {
          setCompletionProof({
            task_id: (lastVisit.id as string) ?? "",
            petugas_id: (lastVisit.surveyor_id as string) ?? "",
            summary: (lastVisit.findings as string) ?? "",
            completion_proof: null,
            completed_at: (lastVisit.created_at as string) ?? "",
          });
        }
      }

      const report = caseData.report as Record<string, unknown>;
      const status = (report.status as string) ?? "";
      if (APPEALABLE_STATUSES.includes(status)) {
        const audit = (caseData as { audit?: unknown[] }).audit ?? [];
        const sanggolEvent = (audit as Array<Record<string, unknown>>).find(
          (e) => (e.action as string) === "sanggahan_filed"
        );
        if (sanggolEvent) {
          setSanggahan({
            filed_at: (sanggolEvent.created_at as string) ?? "",
            ...(sanggolEvent.actor ? { filed_by: sanggolEvent.actor as string } : {}),
          });
        }
      }

      try {
        const usersData = await api.users({ role: "PETUGAS", is_active: true });
        setSurveyors(
          (usersData.data ?? []).map((u: { id: string; name?: string; email: string }) => ({
            id: u.id,
            name: u.name ?? u.email,
          }))
        );
      } catch (e) {
        logger.error("Failed to fetch surveyors", { error: e });
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
    if (REASON_MANDATORY.includes(decision as Decision)) {
      return reason.trim().length >= 10;
    }
    if (decision === "needs_survey") {
      return surveyorId.trim().length > 0;
    }
    if (decision === "duplicate") {
      return duplicateOf.trim().length > 0 && isValidUUID(duplicateOf.trim());
    }
    return true;
  })();

  function isValidUUID(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  async function submitDecision() {
    if (!decision || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.verifikatorDecide(id, {
        decision: decision as Decision,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(decision === "duplicate" && duplicateOf.trim() ? { duplicate_of_report_id: duplicateOf.trim() } : {}),
        ...(decision === "needs_survey" && surveyorId.trim() ? { surveyor_id: surveyorId.trim() } : {}),
        ...(decision === "valid" && assignedUnitId.trim() ? { assigned_unit_id: assignedUnitId.trim() } : {}),
        ...((decision === "valid" || decision === "needs_survey") && deadline.trim() ? { deadline: deadline.trim() } : {}),
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
  };

  async function submitPriorityAdjust() {
    if (!id || overrideReason.trim().length < 10) return;
    setAdjustingPriority(true);
    setError(null);
    try {
      await api.updateReportPriority(id, {
        override_score: overrideScore,
        override_reason: overrideReason.trim(),
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
      await api.verifikatorVerifyCompletion(id, {
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
      await api.verifikatorReviewSanggahan(id, {
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
      <div className="p-4 max-w-4xl">
        <p className="text-sigap-textMuted">Memuat...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 max-w-4xl">
        <p className="text-sigap-perluTindakan">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 text-sm px-3 py-1.5 rounded border border-sigap-border hover:bg-sigap-border"
        >
          Coba lagi
        </button>
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
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">
          Review Kasus #{id?.slice(0, 8)}
        </h1>
        <span className="text-sm text-sigap-textMuted">
          {user?.name ?? ""} ({user?.role ?? ""})
        </span>
      </div>

      <div className="mb-4">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
          reportStatus === "verified" ? "bg-primary-50 text-primary-600" :
          reportStatus === "under_review" ? "bg-info-100 text-info-600" :
          reportStatus === "needs_completion" ? "bg-warning-100 text-warning-600" :
          reportStatus === "needs_survey" ? "bg-primary-50 text-primary-600" :
          reportStatus === "duplicate_merged" ? "bg-primary-50 text-primary-600" :
          reportStatus === "out_of_scope" ? "bg-warning-100 text-warning-600" :
          reportStatus === "rejected" ? "bg-danger-100 text-danger-600" :
          reportStatus === "resolved" ? "bg-primary-50 text-primary-600" :
          "bg-neutral-100 text-neutral-700"
        }`}>
          {reportStatus.replace(/_/g, " ")}
        </span>
      </div>

      <div className="flex gap-1 mb-4 border-b border-sigap-border">
        {(["review", "priority", "completion", "sanggahan"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-sigap-textMuted hover:text-sigap-textSecondary"
            }`}
          >
            {tab === "review" ? "Keputusan" :
             tab === "priority" ? "Prioritas" :
             tab === "completion" ? "Bukti Penyelesaian" :
             "Sanggahan"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger-100 border border-danger-100 rounded-lg">
          <p className="text-sm text-danger-500">{error}</p>
        </div>
      )}

      {activeTab === "review" && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 border border-sigap-border">
            <p className="text-sm font-semibold">
              {report.category_name ?? "Tanpa kategori"}
            </p>
            <p className="text-xs text-sigap-textMuted mt-1">
              Severity: {report.severity ?? "?"}% · Dibuat: {report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : "?"}
            </p>
            {report.description && (
              <p className="text-sm text-sigap-textSecondary mt-3 whitespace-pre-wrap">
                {report.description}
              </p>
            )}
            {Array.isArray(report.photo_urls) && report.photo_urls.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {(report.photo_urls as string[]).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Bukti ${i + 1}`}
                    className="w-24 h-24 object-cover rounded border border-sigap-border"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg p-4 border border-sigap-border">
            <p className="font-semibold mb-2">Penilaian AI</p>
            {Array.isArray(data.assessments) && data.assessments.length > 0 ? (
              <ul className="text-sm space-y-1">
                {(data.assessments as Array<{ assessment_kind?: string; result?: string; created_at?: string }>).map((a, i) => (
                  <li key={i} className="text-sigap-textSecondary">
                    {a.assessment_kind ?? "—"}: {a.result ?? "—"} @ {a.created_at ? new Date(a.created_at).toLocaleString("id-ID") : "?"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-sigap-textMuted">Belum ada penilaian AI.</p>
            )}
          </div>

          {(() => {
            type AssessmentWithDuplicates = {
              duplicate_candidates?: Array<{ report_id: string; distance_m: number }>;
            };
            const allDuplicates: Array<{ report_id: string; distance_m: number }> = [];
            (data.assessments as Array<AssessmentWithDuplicates>).forEach((a) => {
              if (a.duplicate_candidates && Array.isArray(a.duplicate_candidates)) {
                a.duplicate_candidates.forEach((d) => {
                  if (!allDuplicates.some((existing) => existing.report_id === d.report_id)) {
                    allDuplicates.push(d);
                  }
                });
              }
            });
            if (allDuplicates.length === 0) return null;
            return (
              <DuplicateComparisonCards
                currentReport={report as import("../../types").Report}
                duplicateCandidates={allDuplicates}
                onMerge={() => load()}
                onKeepSeparate={() => load()}
              />
            );
          })()}

          {Array.isArray(data.audit) && data.audit.length > 0 && (
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="font-semibold mb-2">Riwayat Audit</p>
              <ul className="text-xs space-y-1">
                {(data.audit as Array<{ action?: string; actor?: string; created_at?: string }>).map((e, i) => (
                  <li key={i} className="text-sigap-textMuted">
                    {new Date(e.created_at ?? "").toLocaleString("id-ID")} — {e.action} oleh {e.actor ?? "?"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reportStatus === "submitted" || reportStatus === "under_review" ? (
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="font-semibold mb-3">Ambil Keputusan</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {(Object.entries(DECISION_LABELS) as [Decision, string][]).map(([key, label]) => (
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
                          Petugas Survei <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={surveyorId}
                          onChange={(e) => setSurveyorId(e.target.value)}
                          className="w-full p-2 border border-sigap-border rounded text-sm"
                        >
                          <option value="">-- Pilih Petugas --</option>
                          {surveyors.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
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
                        <input
                          type="text"
                          value={assignedUnitId}
                          onChange={(e) => setAssignedUnitId(e.target.value)}
                          placeholder="UUID unit"
                          className="w-full p-2 border border-sigap-border rounded text-sm font-mono"
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
                        ID Laporan Duplikat <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={duplicateOf}
                        onChange={(e) => setDuplicateOf(e.target.value)}
                        placeholder="UUID laporan primer"
                        className="w-full p-2 border border-sigap-border rounded text-sm font-mono"
                      />
                      {!duplicateOf && decision === "duplicate" ? null : duplicateOf && !isValidUUID(duplicateOf) ? (
                        <p className="text-xs text-red-500 mt-1">Format UUID tidak valid</p>
                      ) : null}
                    </div>
                  )}

                  {(REASON_MANDATORY.includes(decision) || decision) && (
                    <div>
                      <label className="block text-sm font-semibold mb-1">
                        Alasan {
                          REASON_MANDATORY.includes(decision as Decision)
                            ? "(wajib, min 10 karakter)"
                            : "(opsional)"
                        }:
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={
                          decision === "rejected" ? "Jelaskan mengapa laporan ditolak" :
                          decision === "out_of_scope" ? "Jelaskan mengapa di luar cakupan" :
                          decision === "duplicate" ? "Jelaskan mengapa duplikat" :
                          "Catatan tambahan"
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
            <div className="bg-neutral-50 rounded-lg p-4 border border-sigap-border text-center">
              <p className="text-sm text-sigap-textMuted">
                Kasus sudah dalam status "{reportStatus.replace(/_/g, " ")}" — keputusan sudahfinal.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/verifikator/queue")}
            className="w-full px-4 py-2 bg-neutral-0 text-sigap-textSecondary border border-sigap-border rounded font-medium hover:bg-neutral-50 transition-colors"
          >
            Kembali ke Antrian
          </button>
        </div>
      )}

      {activeTab === "priority" && priority && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 border border-sigap-border">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">Skor Prioritas</p>
              <span className="text-xs text-sigap-textMuted">v{priority.version}</span>
            </div>

            <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  Skor: {priority.score}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: LEVEL_COLORS[priority.level] ?? "#6b7280",
                    color: "#fff",
                  }}
                >
                  {priority.level}
                </span>
              </div>
              <div className="h-3 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${priority.score}%`,
                    backgroundColor: LEVEL_COLORS[priority.level] ?? colors.textMuted,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <PriorityBar label="Severity" value={priority.breakdown.severity} color={colors.perluTindakan} />
              <PriorityBar label="Residents Terdampak" value={priority.breakdown.affected_residents} color={colors.primary} />
              <PriorityBar label="Kerentanan Wilayah" value={priority.breakdown.region_vulnerability} color={colors.diproses} />
              <PriorityBar label="Tekanan SLA" value={priority.breakdown.sla_pressure} color={colors.warning} />
              <PriorityBar label="Faktor Lain" value={priority.breakdown.other_factors} color={colors.diproses} />
            </div>
          </div>

          {(reportStatus === "submitted" || reportStatus === "under_review") && (
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="font-semibold mb-3">Sesuaikan Prioritas</p>
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
                  Alasan Override <span className="text-red-500">*</span> (min 10 karakter)
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
                disabled={overrideReason.trim().length < 10 || adjustingPriority}
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
          <div className="bg-neutral-0 rounded-lg p-4 border border-sigap-border">
            <p className="font-semibold mb-3">Bukti Penyelesaian</p>
            {completionProof ? (
              <div className="space-y-3">
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <p className="text-sm font-medium mb-1">Ringkasan Petugas</p>
                  <p className="text-sm text-sigap-textSecondary whitespace-pre-wrap">
                    {completionProof.summary || "—"}
                  </p>
                </div>
                <div className="text-xs text-sigap-textMuted space-y-1">
                  <p>ID Tugas: <span className="font-mono">{completionProof.task_id}</span></p>
                  <p>ID Petugas: <span className="font-mono">{completionProof.petugas_id}</span></p>
                  <p>Diselesaikan: {completionProof.completed_at ? new Date(completionProof.completed_at).toLocaleString("id-ID") : "?"}</p>
                  {completionProof.verified !== undefined && (
                    <p className={`font-semibold ${completionProof.verified ? "text-green-600" : "text-yellow-600"}`}>
                      Status: {completionProof.verified ? "Disetujui" : "Menunggu verifikasi"}
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
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="font-semibold mb-3">Verifikasi Penyelesaian</p>
              <div className="mb-3">
                <label className="block text-sm font-semibold mb-1">Keputusan</label>
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
                <label className="block text-sm font-semibold mb-1">Catatan (opsional)</label>
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
                disabled={!verifyDecision || (verifyDecision === "rejected" && verifyReason.trim().length < 10) || verifying}
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
          <div className="bg-neutral-0 rounded-lg p-4 border border-sigap-border">
            <p className="font-semibold mb-3">Sanggahan / Obyeksi</p>
            {sanggahan ? (
              <div className="p-3 bg-warning-100 border border-warning-100 rounded-lg">
                <p className="text-sm font-medium text-warning-600 mb-1">Sanggahan telah diajukan</p>
                <p className="text-xs text-warning-500">
                  Diajukan: {sanggahan.filed_at ? new Date(sanggahan.filed_at).toLocaleString("id-ID") : "?"}
                  {sanggahan.filed_by && ` oleh ${sanggahan.filed_by}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-sigap-textMuted">
                {!APPEALABLE_STATUSES.includes(reportStatus)
                  ? `Status "${reportStatus.replace(/_/g, " ")}" tidak dapat menerima sanggahan.`
                  : "Tidak ada sanggahan yang diajukan untuk kasus ini."}
              </p>
            )}
          </div>

          {sanggahan && (
            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <p className="font-semibold mb-3">Tinjau Sanggahan</p>
              <div className="mb-3">
                <label className="block text-sm font-semibold mb-1">Keputusan</label>
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
                  Alasan {sanggahanDecision === "rejected" ? "(wajib)" : "(opsional)"}:
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
                  (sanggahanDecision === "rejected" && sanggahanReason.trim().length < 10) ||
                  reviewingSanggahan
                }
                className="w-full px-4 py-2 bg-primary-500 text-white rounded font-medium disabled:opacity-50 hover:bg-primary-600 transition-colors"
              >
                {reviewingSanggahan ? "Memproses..." : "Kirim Tinjauan Sanggahan"}
              </button>
            </div>
          )}
        </div>
      )}
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
      <span className="text-sm text-sigap-textSecondary w-36 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-medium text-sigap-textMuted w-10 text-right">{percent}%</span>
    </div>
  );
}
