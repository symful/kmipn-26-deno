import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
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

export const PetugasTasks = () => {
  const [tasks, setTasks] = useState<PetugasTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
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
      .petugasTasks(filterStatus || undefined)
      .then((data) => setTasks((data.tasks ?? []).map((t) => ({ ...t, progress_percent: t.progress_percent ?? 0 }))))
      .catch((err) => { logger.error("Failed to fetch petugas tasks", { error: err }); setError(String(err)); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [filterStatus]);

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

  const handlePhotoUpload = async (taskId: string, files: FileList) => {
    if (files.length === 0) return;

    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      try {
        const data = await api.uploadEvidenceFile(file, "task-evidence", "task_evidence");
        urls.push(data.url);
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

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": return "bg-green-100 text-green-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "pending_clarification": return "bg-orange-100 text-orange-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-yellow-100 text-yellow-800";
    }
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
        <p className="text-red-600">Error: {error}</p>
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
              P
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Tugas Petugas</h1>
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
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-lg border border-sigap-border p-4 mb-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-sigap-textSecondary">Filter status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border border-sigap-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sigap-primary"
            >
              <option value="">Semua</option>
              <option value="assigned">Ditugaskan</option>
              <option value="in_progress">Dikerjakan</option>
              <option value="pending_clarification">Menunggu Penjelasan</option>
              <option value="completed">Selesai</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-sigap-border p-4">
          <h2 className="text-sm font-semibold mb-4">Daftar Tugas ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p className="text-sigap-textMuted text-sm text-center py-4">
              Belum ada tugas.
            </p>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border border-sigap-border rounded-lg p-4 hover:bg-sigap-surface transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">Task {task.id.slice(0, 8)}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusColor(task.status)}`}>
                          {statusLabel(task.status)}
                        </span>
                      </div>
                      <p className="text-xs text-sigap-textTertiary mt-1">
                        ID Laporan: {task.report_id.slice(0, 8)} &middot; {task.category_name}
                      </p>
                      {task.report_description && (
                        <p className="text-xs text-sigap-textSecondary mt-2 line-clamp-2">
                          {task.report_description}
                        </p>
                      )}
                      {task.report_address && (
                        <p className="text-xs text-sigap-textTertiary mt-1">
                          {task.report_address}
                        </p>
                      )}
                      {task.instructions && (
                        <p className="text-xs text-sigap-textSecondary mt-2 italic">
                          Instruksi: {task.instructions}
                        </p>
                      )}
                      {task.deadline && (
                        <p className="text-xs text-sigap-perluTindakan mt-2 font-medium">
                          Deadline: {new Date(task.deadline).toLocaleDateString("id-ID")}
                        </p>
                      )}
                      {task.progress_percent !== undefined && task.progress_percent !== null && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-sigap-textMuted mb-1">
                            <span>Progress</span>
                            <span>{task.progress_percent}%</span>
                          </div>
                          <div className="w-full bg-sigap-border rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{ width: `${task.progress_percent}%`, backgroundColor: colors.primary }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {task.photo_urls && task.photo_urls.length > 0 && (
                      <div className="flex gap-1 flex-shrink-0">
                        {task.photo_urls.slice(0, 3).map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Report ${i + 1}`}
                            className="w-12 h-12 object-cover rounded border border-sigap-border"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {task.status === "assigned" && (
                    <div className="border-t border-sigap-border pt-3 mt-3">
                      <p className="text-xs text-sigap-textSecondary mb-2">Terima atau tolak tugas ini:</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptReject(task.id, true, "")}
                          disabled={actionLoading === task.id}
                          className="flex-1 py-2 rounded font-medium text-white text-sm transition-colors disabled:opacity-50 bg-green-600 hover:bg-green-700"
                        >
                          {actionLoading === task.id ? "..." : "Terima"}
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt("Alasan penolakan (opsional):");
                            if (reason !== null) handleAcceptReject(task.id, false, reason);
                          }}
                          disabled={actionLoading === task.id}
                          className="flex-1 py-2 rounded font-medium text-white text-sm transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700"
                        >
                          {actionLoading === task.id ? "..." : "Tolak"}
                        </button>
                      </div>
                    </div>
                  )}

                  {task.status === "in_progress" && (
                    <div className="border-t border-sigap-border pt-3 mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-sigap-textSecondary mb-1">
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
                            className="flex-1 h-2 bg-sigap-border rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-xs font-medium text-sigap-textPrimary w-10 text-right">
                            {progressValues[task.id] ?? task.progress_percent ?? 0}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-sigap-textSecondary mb-1">
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
                          className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sigap-primary"
                        />
                      </div>

                      <button
                        onClick={() => handleUpdateProgress(task.id)}
                        disabled={actionLoading === task.id}
                        className="w-full py-2 rounded font-medium text-white text-sm transition-colors disabled:opacity-50"
                        style={{ backgroundColor: colors.primary }}
                      >
                        {actionLoading === task.id ? "Memperbarui..." : "Update Progress"}
                      </button>

                      <div className="border-t border-sigap-border pt-3">
                        <label className="block text-xs font-medium text-sigap-textSecondary mb-1">
                          Unggah Bukti Foto
                        </label>
                        <div className="flex items-center gap-2 mb-2">
                          <label className="flex-1 py-2 rounded border border-sigap-border text-center text-sm font-medium text-sigap-textSecondary cursor-pointer hover:bg-sigap-surface transition-colors">
                            Pilih Foto
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) handlePhotoUpload(task.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                        {(previewPhotos[task.id] ?? []).length > 0 && (
                          <div className="flex gap-2 flex-wrap mb-2">
                            {(previewPhotos[task.id] ?? []).map((url, i) => (
                              <div key={i} className="relative">
                                <img
                                  src={url}
                                  alt={`Evidence ${i + 1}`}
                                  className="w-16 h-16 object-cover rounded border border-sigap-border"
                                />
                                <button
                                  onClick={() => handleRemovePhoto(task.id, i)}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-xs flex items-center justify-center"
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
                          className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sigap-primary mb-2"
                        />
                        <button
                          onClick={() => handleSubmitEvidence(task.id)}
                          disabled={actionLoading === task.id || (uploadedPhotoUrls[task.id] ?? []).length === 0}
                          className="w-full py-2 rounded font-medium text-white text-sm transition-colors disabled:opacity-50 bg-sigap-primary"
                          style={{ backgroundColor: colors.primary }}
                        >
                          {actionLoading === task.id ? "Mengirim..." : "Kirim Bukti Foto"}
                        </button>
                      </div>

                      <div className="border-t border-sigap-border pt-3">
                        <label className="block text-xs font-medium text-sigap-textSecondary mb-1">
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
                          className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sigap-primary"
                        />
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          disabled={actionLoading === task.id}
                          className="w-full mt-2 py-2 rounded font-medium text-white text-sm transition-colors disabled:opacity-50 bg-green-600 hover:bg-green-700"
                        >
                          {actionLoading === task.id ? "Menyelesaikan..." : "Selesaikan Tugas"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
