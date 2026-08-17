import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, radius, bgSoft, dangerBorder, dangerTextStrong, extendedColors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

interface PetugasTask {
  id: string;
  report_id: string;
  status: string;
  instructions: string | null;
  deadline: string | null;
  progress_percent: number;
  created_at: string;
  updated_at: string;
  report_description: string;
  lng: number;
  lat: number;
  photo_urls: string[];
  severity: number | null;
  report_address: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  unit_name: string;
}

// S-01 Priority types matching Flutter S01TaskPriority
type TaskPriority = "urgent" | "high" | "normal" | "low";

// S-01 Filter chip data
interface FilterChip {
  index: number;
  label: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { index: 0, label: "Hari ini" },
  { index: 1, label: "Terlambat" },
  { index: 2, label: "Semua" },
];

export const PetugasTasks = () => {
  const [tasks, setTasks] = useState<PetugasTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState<number | null>(null);
  const [progressValues, setProgressValues] = useState<Record<string, string>>({});
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState<Record<string, string[]>>({});
  const [previewPhotos, setPreviewPhotos] = useState<Record<string, string[]>>({});
  const [summaryValues, setSummaryValues] = useState<Record<string, string>>({});
  const user = useAuthStore((s) => s.user);

  const loadTasks = () => {
    setLoading(true);
    api
      .petugasTasks()
      .then((data) => setTasks((data.tasks ?? []).map((t) => ({ ...t, progress_percent: t.progress_percent ?? 0 }))))
      .catch((err) => { logger.error("Failed to fetch petugas tasks", { error: err }); setError(String(err)); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // S-01: Filter tasks based on selected chip
  const filteredTasks = (() => {
    if (filterIndex === null) return tasks;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filterIndex) {
      case 0: // Hari ini
        return tasks.filter((t) => {
          const createdAt = new Date(t.created_at);
          return createdAt >= today;
        });
      case 1: // Terlambat
        return tasks.filter((t) => {
          const deadline = t.deadline ? new Date(t.deadline) : null;
          return deadline !== null && deadline < now && t.status !== "completed";
        });
      default:
        return tasks;
    }
  })();

  // S-01: Get priority from severity
  const getPriority = (task: PetugasTask): TaskPriority => {
    const severity = task.severity ?? 2;
    if (severity >= 4) return "urgent";
    if (severity >= 3) return "high";
    if (severity >= 2) return "normal";
    return "low";
  };

  // S-01: Get priority color
  const getPriorityColor = (priority: TaskPriority): string => {
    switch (priority) {
      case "urgent": return colors.perluTindakan; // #c0392b
      case "high": return colors.offlineDot;     // #b8730a
      case "normal": return colors.primary;       // #0f7a6b
      case "low": return colors.textTertiary;    // #616770
    }
  };

  // S-01: Get priority label
  const getPriorityLabel = (priority: TaskPriority): string => {
    switch (priority) {
      case "urgent": return "Urgent";
      case "high": return "High";
      case "normal": return "Normal";
      case "low": return "Low";
    }
  };

  // S-01: Format time ago
  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays > 0) {
      if (diffDays === 1) return "Kemarin";
      if (diffDays < 7) return `${diffDays} hari yang lalu`;
      return `${Math.floor(diffDays / 7)} minggu yang lalu`;
    } else if (diffHours > 0) {
      return `${diffHours} jam yang lalu`;
    } else if (diffMins > 0) {
      return `${diffMins} menit yang lalu`;
    }
    return "Baru saja";
  };

  // S-01: Format date for header
  const formatHeaderDate = (dt: Date): string => {
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${dayNames[dt.getDay()]}, ${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  const handleAcceptReject = async (taskId: string, accept: boolean, reason: string) => {
    setActionLoading(taskId);
    try {
      await api.petugasAccept(taskId, { accept, reason });
      await loadTasks();
    } catch (err) {
      logger.error("Failed to accept/reject task", { error: err });
      alert((accept ? "Gagal menerima" : "Gagal menolak") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateProgress = async (taskId: string) => {
    const progress = parseInt(progressValues[taskId] ?? "0", 10);
    const notes = notesValues[taskId] ?? "";

    if (isNaN(progress)) {
      alert("Masukkan progress yang valid.");
      return;
    }

    setActionLoading(taskId);
    try {
      await api.petugasProgress(taskId, {
        progress_percent: progress,
        ...(notes ? { notes } : {}),
      });
      await loadTasks();
      setProgressValues((prev) => ({ ...prev, [taskId]: "" }));
      setNotesValues((prev) => ({ ...prev, [taskId]: "" }));
    } catch (err) {
      logger.error("Failed to update progress", { error: err });
      alert("Gagal memperbarui: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePhotoUpload = async (taskId: string, reportId: string, files: FileList) => {
    if (files.length === 0) return;

    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      try {
        const contentType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const urlData = await api.photoUploadUrl(reportId, contentType);
        const response = await fetch(urlData.upload_url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        urls.push(urlData.public_url);
      } catch (err) {
        logger.error("Photo upload error", { error: err });
        alert("Gagal mengunggah foto: " + (err instanceof Error ? err.message : String(err)));
        return;
      }
    }

    setUploadedPhotoUrls((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), ...urls] }));
    setPreviewPhotos((prev) => {
      const existing = prev[taskId] ?? [];
      const newPreviews = Array.from(files).map((f) => URL.createObjectURL(f));
      return { ...prev, [taskId]: [...existing, ...newPreviews] };
    });
  };

  const handleRemovePhoto = (taskId: string, index: number) => {
    setUploadedPhotoUrls((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter((_, i) => i !== index),
    }));
    setPreviewPhotos((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleSubmitEvidence = async (taskId: string) => {
    const urls = uploadedPhotoUrls[taskId] ?? [];
    const notes = evidenceNotes[taskId] ?? "";

    if (urls.length === 0) {
      alert("Unggah setidaknya satu foto bukti.");
      return;
    }

    setActionLoading(taskId);
    try {
      await api.petugasEvidence(taskId, {
        photo_urls: urls,
        ...(notes ? { notes } : {}),
      });
      setUploadedPhotoUrls((prev) => ({ ...prev, [taskId]: [] }));
      setPreviewPhotos((prev) => ({ ...prev, [taskId]: [] }));
      setEvidenceNotes((prev) => ({ ...prev, [taskId]: "" }));
      await loadTasks();
    } catch (err) {
      logger.error("Failed to submit evidence", { error: err });
      alert("Gagal mengirim bukti: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    const summary = summaryValues[taskId] ?? "";

    if (!summary || summary.length < 10) {
      alert("Masukkan ringkasan minimal 10 karakter.");
      return;
    }

    setActionLoading(taskId);
    try {
      await api.petugasComplete(taskId, {
        summary,
        completion_proof: (uploadedPhotoUrls[taskId] ?? [])[0] ?? null,
      });
      setSummaryValues((prev) => ({ ...prev, [taskId]: "" }));
      await loadTasks();
    } catch (err) {
      logger.error("Failed to complete task", { error: err });
      alert("Gagal menyelesaikan tugas: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setActionLoading(null);
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "assigned": return "Ditugaskan";
      case "in_progress": return "Dikerjakan";
      case "pending_clarification": return "Menunggu Penjelasan";
      case "completed": return "Selesai";
      case "rejected": return "Ditolak";
      default: return s;
    }
  };

  // Status badge colors using design tokens
  const statusBadge: Record<string, { bg: string; text: string }> = {
    completed: { bg: extendedColors.successBorder, text: colors.selesai },
    in_progress: { bg: colors.infoBg, text: colors.diproses },
    pending_clarification: { bg: colors.warningBg, text: colors.offlineText },
    rejected: { bg: colors.dangerBg, text: colors.perluTindakan },
  };

  const statusColor = (s: string) => {
    const badge = statusBadge[s] ?? { bg: colors.warningBg, text: colors.offlineText };
    return { backgroundColor: badge.bg, color: badge.text };
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: bgSoft }}>
        <div className="p-6 max-w-4xl mx-auto">
          {/* Loading skeleton */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-4 p-4 rounded-xl border" style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}>
              <div className="flex">
                <div className="w-1 h-16 rounded" style={{ backgroundColor: colors.border }} />
                <div className="flex-1 ml-4 space-y-3">
                  <div className="h-4 rounded w-3/4" style={{ backgroundColor: colors.border }} />
                  <div className="h-3 rounded w-1/2" style={{ backgroundColor: colors.border }} />
                  <div className="h-3 rounded w-1/4" style={{ backgroundColor: colors.border }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgSoft }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: dangerBorder }}>
            <svg className="w-8 h-8" style={{ color: colors.perluTindakan }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: colors.textPrimary }}>Gagal memuat tugas</p>
          <p className="text-sm mb-4" style={{ color: colors.textTertiary }}>{error}</p>
          <button
            onClick={loadTasks}
            className="px-4 py-2 rounded-lg text-white font-medium text-sm"
            style={{ backgroundColor: colors.primary }}
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgSoft }}>
      {/* S-01 Header */}
      <header
        className="px-6 py-4 border-b"
        style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>
              Tugas hari ini
            </h1>
            <Link
              to="/admin"
              className="text-sm font-medium hover:underline"
              style={{ color: colors.primary }}
            >
              Kembali
            </Link>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: colors.textTertiary }}>
            <span>{formatHeaderDate(new Date())}</span>
            <span>•</span>
            <span className="font-semibold" style={{ color: colors.textSecondary }}>
              {user?.name ?? ""} ({user?.role ?? ""})
            </span>
          </div>
        </div>
      </header>

      {/* S-01 Filter Chips */}
      <div
        className="px-6 py-3 border-b overflow-x-auto"
        style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
      >
        <div className="max-w-4xl mx-auto flex gap-2">
          {FILTER_CHIPS.map((chip) => {
            const isSelected = chip.index === filterIndex;
            return (
              <button
                key={chip.index}
                onClick={() => setFilterIndex(isSelected ? null : chip.index)}
                className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isSelected ? colors.primary : bgSoft,
                  color: isSelected ? colors.bgCard : colors.textSecondary,
                  border: `1px solid ${isSelected ? colors.primary : colors.border}`,
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="p-6 max-w-4xl mx-auto">
        {filteredTasks.length === 0 ? (
          // S-01 Empty state
          <div className="text-center py-16">
            <div
              className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: bgSoft, border: `2px solid ${colors.border}`, color: colors.textTertiary }}
            >
              <svg className="w-10 h-10" style={{ color: colors.textTertiary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: colors.textPrimary }}>
              Tidak ada tugas
            </h3>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              Tugas akan muncul di sini
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const priority = getPriority(task);
              const priorityColor = getPriorityColor(priority);
              const priorityLabel = getPriorityLabel(priority);

              return (
                <div
                  key={task.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: colors.bgCard,
                    border: `1px solid ${colors.border}`,
                    borderLeft: `4px solid ${priorityColor}`,
                  }}
                >
                  {/* Card Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title row with status badge */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-sm truncate" style={{ color: colors.textPrimary }}>
                            {task.report_description || `Task ${task.id.slice(0, 8)}`}
                          </h3>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                            style={statusColor(task.status)}
                          >
                            {statusLabel(task.status)}
                          </span>
                        </div>

                        {/* Category & Report ID */}
                        <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
                          {task.category_name} • ID: {task.report_id.slice(0, 8)}
                        </p>

                        {/* Address */}
                        {task.report_address && (
                          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
                            {task.report_address}
                          </p>
                        )}

                        {/* Time ago */}
                        <p className="text-xs mb-2" style={{ color: colors.textTertiary }}>
                          {formatTimeAgo(task.created_at)}
                        </p>

                        {/* Instructions */}
                        {task.instructions && (
                          <p className="text-xs mb-2 italic" style={{ color: colors.textSecondary }}>
                            Instruksi: {task.instructions}
                          </p>
                        )}

                        {/* Deadline */}
                        {task.deadline && (
                          <p className="text-xs font-medium mb-2" style={{ color: colors.perluTindakan }}>
                            Deadline: {new Date(task.deadline).toLocaleDateString("id-ID")}
                          </p>
                        )}

                        {/* Progress bar */}
                        {task.progress_percent !== undefined && task.progress_percent !== null && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span style={{ color: colors.textTertiary }}>Progress</span>
                              <span className="font-medium" style={{ color: colors.textSecondary }}>
                                {task.progress_percent}%
                              </span>
                            </div>
                            <div
                              className="w-full rounded-full h-1.5"
                              style={{ backgroundColor: colors.border }}
                            >
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{ width: `${task.progress_percent}%`, backgroundColor: colors.primary }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Photos & Priority Badge */}
                      <div className="flex flex-col items-end gap-2">
                        {/* S-01 Priority Badge */}
                        <div
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold"
                          style={{ backgroundColor: bgSoft, color: priorityColor }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: priorityColor }}
                          />
                          {priorityLabel}
                        </div>

                        {/* Photo thumbnails */}
                        {task.photo_urls && task.photo_urls.length > 0 && (
                          <div className="flex gap-1">
                            {task.photo_urls.slice(0, 3).map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Report ${i + 1}`}
                                className="w-10 h-10 object-cover rounded"
                                style={{ border: `1px solid ${colors.border}` }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* S-02 Action Bar - Assigned State */}
                  {task.status === "assigned" && (
                    <div
                      className="px-4 py-3 border-t flex gap-3"
                      style={{ borderColor: colors.border, backgroundColor: bgSoft }}
                    >
                      <button
                        onClick={() => {
                          const reason = prompt("Alasan penolakan (opsional):");
                          if (reason !== null) handleAcceptReject(task.id, false, reason);
                        }}
                        disabled={actionLoading === task.id}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                        style={{
                          border: `1px solid ${dangerBorder}`,
                          color: dangerTextStrong,
                        }}
                      >
                        Tolak
                      </button>
                      <button
                        onClick={() => handleAcceptReject(task.id, true, "")}
                        disabled={actionLoading === task.id}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                        style={{ backgroundColor: colors.primary }}
                      >
                        {actionLoading === task.id ? "..." : "Terima Tugas"}
                      </button>
                    </div>
                  )}

                  {/* In Progress Actions */}
                  {task.status === "in_progress" && (
                    <div className="border-t" style={{ borderColor: colors.border }}>
                      {/* Progress Update */}
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                            Update Progress (0-100%)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={progressValues[task.id] ?? String(task.progress_percent ?? 0)}
                              onChange={(e) =>
                                setProgressValues((prev) => ({
                                  ...prev,
                                  [task.id]: e.target.value,
                                }))
                              }
                              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                              style={{ backgroundColor: colors.border }}
                            />
                            <span className="text-xs font-medium w-10 text-right" style={{ color: colors.textSecondary }}>
                              {progressValues[task.id] ?? task.progress_percent ?? 0}%
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                            Catatan Progress
                          </label>
                          <textarea
                            rows={2}
                            value={notesValues[task.id] ?? ""}
                            onChange={(e) =>
                              setNotesValues((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                            placeholder="Masukkan catatan..."
                            className="w-full px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-2"
                            style={{
                              border: `1px solid ${colors.border}`,
                              backgroundColor: colors.bgCard,
                              color: colors.textPrimary,
                            }}
                          />
                        </div>

                        <button
                          onClick={() => handleUpdateProgress(task.id)}
                          disabled={actionLoading === task.id}
                          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                          style={{ backgroundColor: colors.primary }}
                        >
                          {actionLoading === task.id ? "Memperbarui..." : "Update Progress"}
                        </button>
                      </div>

                      {/* Photo Evidence */}
                      <div className="px-4 pb-4 space-y-3">
                        <label className="block text-xs font-medium" style={{ color: colors.textSecondary }}>
                          Unggah Bukti Foto
                        </label>
                        <label
                          className="flex items-center justify-center py-3 rounded-lg border text-sm font-medium cursor-pointer transition-colors"
                          style={{ borderColor: colors.border, color: colors.textSecondary }}
                        >
                          Pilih Foto
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files) handlePhotoUpload(task.id, task.report_id, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>

                        {(previewPhotos[task.id] ?? []).length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {(previewPhotos[task.id] ?? []).map((url, i) => (
                              <div key={i} className="relative">
                                <img
                                  src={url}
                                  alt={`Evidence ${i + 1}`}
                                  className="w-14 h-14 object-cover rounded"
                                  style={{ border: `1px solid ${colors.border}` }}
                                />
                                <button
                                  onClick={() => handleRemovePhoto(task.id, i)}
                                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center"
                                  style={{ backgroundColor: colors.perluTindakan }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <textarea
                          rows={1}
                          value={evidenceNotes[task.id] ?? ""}
                          onChange={(e) =>
                            setEvidenceNotes((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="Catatan foto (opsional)"
                          className="w-full px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-2"
                          style={{
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.bgCard,
                            color: colors.textPrimary,
                          }}
                        />

                        <button
                          onClick={() => handleSubmitEvidence(task.id)}
                          disabled={actionLoading === task.id || (uploadedPhotoUrls[task.id] ?? []).length === 0}
                          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                          style={{ backgroundColor: colors.primary }}
                        >
                          {actionLoading === task.id ? "Mengirim..." : "Kirim Bukti Foto"}
                        </button>
                      </div>

                      {/* Complete Task */}
                      <div
                        className="px-4 pb-4 pt-3 border-t"
                        style={{ borderColor: colors.border }}
                      >
                        <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                          Ringkasan Penyelesaian
                        </label>
                        <textarea
                          rows={2}
                          value={summaryValues[task.id] ?? ""}
                          onChange={(e) =>
                            setSummaryValues((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="Masukkan ringkasan penyelesaian (min. 10 karakter)..."
                          className="w-full px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 mb-2"
                          style={{
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.bgCard,
                            color: colors.textPrimary,
                          }}
                        />
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          disabled={actionLoading === task.id}
                          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                          style={{ backgroundColor: colors.selesai }}
                        >
                          {actionLoading === task.id ? "Menyelesaikan..." : "Selesaikan Tugas"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
