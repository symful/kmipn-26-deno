import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";

export type SyncStatus = "synced" | "pending" | "failed";

export interface SyncQueueItem {
  taskId: string;
  submittedAt: string;
  payload: {
    findings: string;
    checklist: Array<{ item: string; checked: boolean }>;
    photo_urls?: string[];
    category_id?: string;
    lat?: number;
    lng?: number;
    device_id?: string;
  };
  status: SyncStatus;
  error?: string;
}

interface SyncQueueState {
  // Set of downloaded task IDs (persisted)
  downloadedTaskIds: string[];
  // Queue of pending sync items (persisted)
  queue: SyncQueueItem[];
  // Loading states per task
  syncingTaskIds: Set<string>;

  downloadTask: (taskId: string) => void;
  removeDownload: (taskId: string) => void;
  isDownloaded: (taskId: string) => boolean;

  enqueueSync: (item: Omit<SyncQueueItem, "status" | "error">) => void;
  updateSyncStatus: (taskId: string, status: SyncStatus, error?: string) => void;
  removeSyncItem: (taskId: string) => void;
  getPendingItems: () => SyncQueueItem[];

  setSyncing: (taskId: string, value: boolean) => void;
  isSyncing: (taskId: string) => boolean;

  processSync: () => Promise<void>;
}

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set, get) => ({
      downloadedTaskIds: [],
      queue: [],
      syncingTaskIds: new Set<string>(),

      downloadTask: (taskId) =>
        set((s) => ({
          downloadedTaskIds: s.downloadedTaskIds.includes(taskId)
            ? s.downloadedTaskIds
            : [...s.downloadedTaskIds, taskId],
        })),

      removeDownload: (taskId) =>
        set((s) => ({
          downloadedTaskIds: s.downloadedTaskIds.filter((id) => id !== taskId),
        })),

      isDownloaded: (taskId) => get().downloadedTaskIds.includes(taskId),

      enqueueSync: (item) =>
        set((s) => {
          const exists = s.queue.find((q) => q.taskId === item.taskId);
          if (exists) return s;
          return {
            queue: [
              ...s.queue,
              { ...item, status: "pending" as SyncStatus },
            ],
          };
        }),

      updateSyncStatus: (taskId, status, error) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.taskId === taskId ? { ...q, status, ...(error !== undefined ? { error } : {}) } : q
          ),
        })),

      removeSyncItem: (taskId) =>
        set((s) => ({
          queue: s.queue.filter((q) => q.taskId !== taskId),
        })),

      getPendingItems: () => get().queue.filter((q) => q.status === "pending"),

      setSyncing: (taskId, value) =>
        set((s) => {
          const next = new Set(s.syncingTaskIds);
          if (value) next.add(taskId);
          else next.delete(taskId);
          return { syncingTaskIds: next };
        }),

      isSyncing: (taskId) => get().syncingTaskIds.has(taskId),

      processSync: async () => {
        const pending = get().getPendingItems();
        for (const item of pending) {
          const taskId = item.taskId;
          get().setSyncing(taskId, true);
          try {
            const callObj: Parameters<typeof api.createReportPublic>[0] = {
              category_id: item.payload.category_id ?? "",
              description: item.payload.findings,
              lat: item.payload.lat ?? 0,
              lng: item.payload.lng ?? 0,
              idempotency_key: taskId,
              device_id: item.payload.device_id ?? "",
            };
            if (item.payload.photo_urls) {
              callObj.photo_urls = item.payload.photo_urls;
            }
            await api.createReportPublic(callObj);
            get().updateSyncStatus(taskId, "synced");
            get().removeSyncItem(taskId);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            get().updateSyncStatus(taskId, "failed", msg);
          } finally {
            get().setSyncing(taskId, false);
          }
        }
      },
    }),
    {
      name: "sigap-sync-queue",
      partialize: (s) => ({
        downloadedTaskIds: s.downloadedTaskIds,
        queue: s.queue,
      }),
    }
  )
);
