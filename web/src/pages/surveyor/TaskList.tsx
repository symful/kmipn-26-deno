import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useSyncQueueStore } from "../../stores/syncQueue";
import { logger } from "@/lib/logger";

interface Task {
  id: string;
  report_id: string;
  instructions: string | null;
  deadline: string | null;
  status: string;
}

interface SyncQueueItem {
  taskId: string;
  submittedAt: string;
  status: "synced" | "pending" | "failed";
  error?: string;
}

function SyncBadge({ status }: { status: "synced" | "pending" | "failed" | "downloaded" | "offline" }) {
  const map: Record<string, { label: string; cls: string }> = {
    synced: { label: "Tersinkron", cls: "bg-emerald-100 text-emerald-800" },
    pending: { label: "Menunggu Sync", cls: "bg-amber-100 text-amber-800" },
    failed: { label: "Gagal Sync", cls: "bg-red-100 text-red-800" },
    downloaded: { label: "Diunduh", cls: "bg-blue-100 text-blue-800" },
    offline: { label: "Offline", cls: "bg-gray-100 text-gray-600" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function SyncQueuePanel({
  items,
  onRetry,
  onRemove,
}: {
  items: SyncQueueItem[];
  onRetry: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6 border border-amber-300 bg-amber-50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-amber-800 mb-3">
        Antrean Sinkronisasi ({items.length})
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.taskId}
            className="flex items-center justify-between bg-white rounded p-3 border border-amber-200"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Task {item.taskId.slice(0, 8)}</p>
              <p className="text-xs text-gray-500">
                Dikirim: {new Date(item.submittedAt).toLocaleString("id-ID")}
              </p>
              {item.error && (
                <p className="text-xs text-red-600 mt-1 truncate">{item.error}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              {item.status === "failed" && (
                <button
                  onClick={() => onRetry(item.taskId)}
                  className="text-xs px-3 py-1 bg-amber-200 text-amber-900 rounded hover:bg-amber-300 transition-colors"
                >
                  Coba Lagi
                </button>
              )}
              {item.status !== "synced" && (
                <button
                  onClick={() => onRemove(item.taskId)}
                  className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                >
                  Hapus
                </button>
              )}
              <SyncBadge status={item.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSyncQueue, setShowSyncQueue] = useState(false);
  const [syncingTaskIds, setSyncingTaskIds] = useState<Set<string>>(new Set());

  const {
    downloadedTaskIds,
    queue,
    downloadTask,
    removeDownload,
    isDownloaded,
    enqueueSync,
    updateSyncStatus,
    removeSyncItem,
  } = useSyncQueueStore();

  useEffect(() => {
    api.surveyorTasks()
      .then((data) => setTasks(data.tasks ?? []))
      .catch((e) => { logger.error("Failed to fetch surveyor tasks", { error: e }); setError(String(e)); })
      .finally(() => setLoading(false));
  }, []);

  const pendingItems = queue.filter((q) => q.status === "pending" || q.status === "failed");

  function toggleDownload(taskId: string) {
    if (isDownloaded(taskId)) {
      removeDownload(taskId);
    } else {
      downloadTask(taskId);
    }
  }

  async function retrySync(taskId: string) {
    const item = queue.find((q) => q.taskId === taskId);
    if (!item) return;
    setSyncingTaskIds((s) => new Set(s).add(taskId));
    try {
      await api.surveyorVisit(taskId, item.payload);
      updateSyncStatus(taskId, "synced");
    } catch (e) {
      logger.error("Failed to sync task", { error: e });
      updateSyncStatus(taskId, "failed", (e as Error).message);
    } finally {
      setSyncingTaskIds((s) => {
        const next = new Set(s);
        next.delete(taskId);
        return next;
      });
    }
  }

  function handleRemoveSyncItem(taskId: string) {
    removeSyncItem(taskId);
  }

  function getSyncStatus(taskId: string): "downloaded" | "pending" | "failed" | "synced" | "offline" {
    const queued = queue.find((q) => q.taskId === taskId);
    if (queued) return queued.status;
    if (isDownloaded(taskId)) return "downloaded";
    return "offline";
  }

  if (loading) {
    return (
      <div className="p-4 min-h-[200px] flex items-center justify-center">
        <p className="text-sm text-gray-500">Memuat tugas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 min-h-[200px] flex items-center justify-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Tugas Survei ({tasks.length})</h1>
        {pendingItems.length > 0 && (
          <button
            onClick={() => setShowSyncQueue((v) => !v)}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showSyncQueue
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-amber-200 text-amber-900 border border-amber-300 hover:bg-amber-300"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync
            <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {pendingItems.length}
            </span>
          </button>
        )}
      </div>

      {showSyncQueue && (
        <SyncQueuePanel
          items={pendingItems}
          onRetry={retrySync}
          onRemove={handleRemoveSyncItem}
        />
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada tugas survei.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const syncStatus = getSyncStatus(t.id);
            const isSyncing = syncingTaskIds.has(t.id);
            return (
              <div
                key={t.id}
                className={`bg-white rounded-lg border p-4 transition-colors ${
                  syncStatus === "pending" || syncStatus === "failed"
                    ? "border-amber-300"
                    : syncStatus === "downloaded"
                    ? "border-blue-200"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/surveyor/tasks/${t.id}`}
                        className="font-semibold text-sm hover:text-teal-700 transition-colors"
                      >
                        Task {t.id.slice(0, 8)}
                      </Link>
                      <SyncBadge status={syncStatus} />
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {t.instructions ?? "Tidak ada instruksi"}
                    </p>
                    {t.deadline && (
                      <p className="text-xs text-gray-400 mt-1">
                        Tenggat: {new Date(t.deadline).toLocaleDateString("id-ID")}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <button
                      onClick={() => toggleDownload(t.id)}
                      disabled={isSyncing}
                      title={isDownloaded(t.id) ? "Hapus dari offline" : "Unduh untuk offline"}
                      className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                        isDownloaded(t.id)
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {isSyncing ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : isDownloaded(t.id) ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
