import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { logger } from "@/lib/logger";

interface ChecklistItem {
  item: string;
  checked: boolean;
  photo?: string;
  gps?: { lat: number; lng: number };
}

interface DraftData {
  taskId: string;
  findings: string;
  checklist: ChecklistItem[];
  savedAt: string;
}

const DRAFT_KEY_PREFIX = "surveyor_draft_";
const SYNC_QUEUE_KEY = "surveyor_sync_queue";

function getDraftKey(taskId: string) {
  return `${DRAFT_KEY_PREFIX}${taskId}`;
}

function loadDraft(taskId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(getDraftKey(taskId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function saveDraft(taskId: string, data: Omit<DraftData, "taskId" | "savedAt">) {
  const draft: DraftData = {
    taskId,
    ...data,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(getDraftKey(taskId), JSON.stringify(draft));
}

function clearDraft(taskId: string) {
  localStorage.removeItem(getDraftKey(taskId));
}

interface QueuedSubmission {
  id: string;
  taskId: string;
  data: { findings: string; checklist: ChecklistItem[]; photo_urls: string[] };
  queuedAt: string;
}

function loadSyncQueue(): QueuedSubmission[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedSubmission[];
  } catch {
    return [];
  }
}

function saveSyncQueue(queue: QueuedSubmission[]) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function addToSyncQueue(taskId: string, data: { findings: string; checklist: ChecklistItem[]; photo_urls: string[] }) {
  const queue = loadSyncQueue();
  queue.push({
    id: crypto.randomUUID(),
    taskId,
    data,
    queuedAt: new Date().toISOString(),
  });
  saveSyncQueue(queue);
}

function isOnline(): boolean {
  return navigator.onLine;
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [task, setTask] = useState<{
    id: string;
    report_id: string;
    status: string;
    instructions: string | null;
    deadline: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [findings, setFindings] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "queued" | "syncing">("idle");
  const [gpsLoading, setGpsLoading] = useState<Record<number, boolean>>({});
  const [photoUploading, setPhotoUploading] = useState<Record<number, boolean>>({});

  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.surveyorTask(id),
      api.taskChecklistTemplate(id),
    ])
      .then(([taskRes, checklistRes]) => {
        setTask(taskRes.task);

        const draft = loadDraft(id);
        if (draft) {
          setFindings(draft.findings);
          setChecklist(draft.checklist);
        } else {
          setChecklist(checklistRes.checklist.map((c) => ({ ...c })));
        }

        const queue = loadSyncQueue();
        const pending = queue.find((q) => q.taskId === id);
        if (pending) {
          setSyncStatus("queued");
        }
      })
      .catch((e) => { logger.error("Failed to fetch task detail", { error: e }); setError((e as Error).message); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || loading) return;

    const draft = loadDraft(id);
    if (!draft) return;

    const autoSave = setInterval(() => {
      saveDraft(id, { findings, checklist });
    }, 5000);

    return () => clearInterval(autoSave);
  }, [id, loading, findings, checklist]);

  const captureGps = useCallback(async (index: number) => {
    if (!navigator.geolocation) {
      setError("Geolocation tidak didukung perangkat ini");
      return;
    }

    setGpsLoading((prev) => ({ ...prev, [index]: true }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setChecklist((prev) =>
          prev.map((c, i) =>
            i === index ? { ...c, gps: { lat: latitude, lng: longitude } } : c
          )
        );
        setGpsLoading((prev) => ({ ...prev, [index]: false }));
      },
      (err) => {
        setError(`GPS error: ${err.message}`);
        setGpsLoading((prev) => ({ ...prev, [index]: false }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handlePhotoChange = useCallback(
    async (index: number, file: File) => {
      if (!file || !file.type.startsWith("image/")) return;

      setPhotoUploading((prev) => ({ ...prev, [index]: true }));

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const base64Data = base64.split(",")[1] ?? "";
        const contentType: string = file.type === "image/png" ? "image/png" : "image/jpeg";
        const reportId: string = task?.report_id ?? "";

        const data = await api.surveyorPhotoUpload(reportId, contentType, base64Data);
        const photoUrl = data.public_url;

        setChecklist((prev) =>
          prev.map((c, i) => (i === index ? { ...c, photo: photoUrl } : c))
        );
      } catch (e) {
        logger.error("Failed to upload photo", { error: e });
        setError(`Gagal mengunggah foto: ${(e as Error).message}`);
      } finally {
        setPhotoUploading((prev) => ({ ...prev, [index]: false }));
        if (fileInputRefs.current[index]) {
          fileInputRefs.current[index]!.value = "";
        }
      }
    },
    [task?.report_id]
  );

  const toggleChecklistItem = useCallback((i: number) => {
    setChecklist((prev) =>
      prev.map((c, idx) =>
        idx === i ? { ...c, checked: !c.checked } : c
      )
    );
  }, []);

  const canSubmit =
    findings.trim().length > 0 &&
    checklist.some((c) => c.checked) &&
    !submitting;

  const submit = async () => {
    if (!id || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      findings,
      checklist: checklist.map((c) => ({ item: c.item, checked: c.checked })),
      photo_urls: checklist
        .map((c) => c.photo)
        .filter((p): p is string => Boolean(p)),
    };

    if (!isOnline()) {
      addToSyncQueue(id, payload);
      clearDraft(id);
      setSyncStatus("queued");
      setSubmitting(false);
      return;
    }

    setSyncStatus("syncing");

    try {
      await api.surveyorVisit(id, {
        findings: payload.findings,
        checklist: payload.checklist,
        photo_urls: payload.photo_urls,
      });
      clearDraft(id);
      navigate("/surveyor/tasks");
    } catch (e) {
      logger.error("Failed to submit survey", { error: e });
      if (!isOnline()) {
        addToSyncQueue(id, payload);
        clearDraft(id);
        setSyncStatus("queued");
      } else {
        setError((e as Error).message);
      }
      setSubmitting(false);
      setSyncStatus("idle");
    }
  };

  const syncQueued = async () => {
    if (!isOnline()) return;

    const queue = loadSyncQueue();
    if (queue.length === 0) return;

    setSyncStatus("syncing");

    for (const item of queue) {
      try {
        await api.surveyorVisit(item.taskId, {
          findings: item.data.findings,
          checklist: item.data.checklist,
          photo_urls: item.data.photo_urls,
        });
        clearDraft(item.taskId);
      } catch (e) {
        logger.error(`Failed to sync surveyor visit ${item.taskId}`, { error: e });
      }
    }

    saveSyncQueue([]);
    setSyncStatus("idle");
  };

  useEffect(() => {
    const handleOnline = () => {
      if (syncStatus === "queued") {
        syncQueued();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncStatus]);

  if (loading) {
    return (
      <div className="p-4 max-w-2xl">
        <p className="text-sigap-textMuted">Memuat...</p>
      </div>
    );
  }

  if (error && !task) {
    return (
      <div className="p-4 max-w-2xl">
        <p className="text-sigap-perluTindakan">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">
          Hasil Survei #{id?.slice(0, 8)}
        </h1>
        <span className="text-sm text-sigap-textMuted">{user?.name ?? ""}</span>
      </div>

      {task && (
        <div className="bg-white rounded-lg p-4 border border-sigap-border mb-4">
          <p className="text-sm">
            <strong>Report:</strong> <span className="font-mono">{task.report_id}</span>
          </p>
          {task.instructions && (
            <p className="text-sm mt-2">
              <strong>Instruksi:</strong> {task.instructions}
            </p>
          )}
          {task.deadline && (
            <p className="text-sm mt-2">
              <strong>Tenggat:</strong>{" "}
              {new Date(task.deadline).toLocaleDateString("id-ID")}
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg p-4 border border-sigap-border space-y-3">
        <div>
          <label className="block font-semibold mb-1">Temuan:</label>
          <textarea
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="Deskripsikan kondisi lapangan"
            className="w-full p-2 border border-sigap-border rounded"
            rows={4}
          />
        </div>

        <div>
          <label className="block font-semibold mb-1">Checklist:</label>
          {checklist.map((c, i) => (
            <div key={i} className="border border-sigap-border rounded p-3 mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.checked}
                  onChange={() => toggleChecklistItem(i)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">{c.item}</span>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <input
                  ref={(el) => { fileInputRefs.current[i] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoChange(i, file);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[i]?.click()}
                  disabled={photoUploading[i]}
                  className="px-3 py-1 text-xs border border-sigap-border rounded hover:bg-sigap-background disabled:opacity-50"
                >
                  {photoUploading[i] ? "Mengunggah..." : c.photo ? "Ganti Foto" : "Ambil Foto"}
                </button>
                {c.photo && (
                  <span className="text-xs text-green-600 font-medium">Foto terunggah</span>
                )}

                <button
                  type="button"
                  onClick={() => captureGps(i)}
                  disabled={gpsLoading[i]}
                  className="px-3 py-1 text-xs border border-sigap-border rounded hover:bg-sigap-background disabled:opacity-50"
                >
                  {gpsLoading[i] ? "Mendapatkan GPS..." : c.gps ? "Update GPS" : "Ambil GPS"}
                </button>
                {c.gps && (
                  <span className="text-xs text-green-600 font-mono font-medium">
                    {c.gps.lat.toFixed(6)}, {c.gps.lng.toFixed(6)}
                  </span>
                )}
              </div>

              {c.photo && (
                <div className="mt-2">
                  <img
                    src={c.photo}
                    alt={`Foto ${i + 1}`}
                    className="w-full max-h-48 object-cover rounded border border-sigap-border"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className={`text-sm text-sigap-perluTindakan bg-danger-50 p-2 rounded`}>
            {error}
          </p>
        )}

        {syncStatus === "queued" && (
          <p className={`text-sm text-warning-600 bg-warning-50 p-2 rounded`}>
            Data disimpan secara offline. Akan dikirim saat koneksi tersedia.
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={`w-full px-4 py-2 bg-primary-600 text-white rounded font-medium disabled:opacity-50`}
        >
          {submitting
            ? "Mengirim..."
            : syncStatus === "syncing"
            ? "Menyinkronkan..."
            : syncStatus === "queued"
            ? "Terkirim (Offline)"
            : "Kirim Hasil"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (id) saveDraft(id, { findings, checklist });
            navigate("/surveyor/tasks");
          }}
          className="w-full px-4 py-2 bg-white text-sigap-textSecondary border border-sigap-border rounded"
        >
          Batal
        </button>
      </div>
    </div>
  );
}