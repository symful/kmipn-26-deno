import { create } from "zustand";
import { api } from "../api/client";
import type { Notification } from "../types";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  reset: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
}

let revision = 0;
let fetchVersion = 0;
let pending: Promise<void> | undefined;
export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  reset: () => {
    revision++;
    fetchVersion++;
    pending = undefined;
    set({ notifications: [], unreadCount: 0, loading: false, error: null });
  },
  markAsRead: async (id) => {
    const session = revision;
    await api.markNotificationRead(id);
    if (session !== revision) return;
    fetchVersion++;
    pending = undefined;
    const notifications = get().notifications.map((n) =>
      n.id === id
        ? { ...n, read_at: n.read_at || new Date().toISOString() }
        : n,
    );
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read_at).length,
    });
    await get().fetchNotifications();
  },
  markAllAsRead: async () => {
    const session = revision;
    await api.markAllNotificationsRead();
    if (session !== revision) return;
    fetchVersion++;
    pending = undefined;
    set({
      notifications: get().notifications.map((n) => ({
        ...n,
        read_at: n.read_at || new Date().toISOString(),
      })),
      unreadCount: 0,
    });
    await get().fetchNotifications();
  },
  fetchNotifications: () => {
    if (pending) return pending;
    const session = revision;
    const version = ++fetchVersion;
    set({ loading: true, error: null });
    const request = (async () => {
      try {
        const { data } = await api.notifications();
        if (session === revision && version === fetchVersion)
          set({
            notifications: data,
            unreadCount: data.filter((n) => !n.read_at).length,
          });
      } catch {
        if (session === revision && version === fetchVersion)
          set({ error: "Gagal memuat notifikasi" });
      } finally {
        if (session === revision && version === fetchVersion) {
          pending = undefined;
          set({ loading: false });
        }
      }
    })();
    pending = request;
    return request;
  },
}));
