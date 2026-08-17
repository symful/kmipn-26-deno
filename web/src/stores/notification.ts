import { create } from "zustand";
import { api } from "../api/client";
import type { Notification } from "../types";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  fetchNotifications: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) => {
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read_at).length,
    });
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() }
      ),
      unreadCount: 0,
    }));
  },

  fetchNotifications: async () => {
    try {
      const res = await api.notifications() as { entries: Array<{
        id: string;
        user_id: string | null;
        kind: string;
        title: string;
        body: string;
        related_report_id: string | null;
        read_at: string | null;
        created_at: string;
      }> };
      const notifications: Notification[] = (res.entries ?? []).map((e) => ({
        id: e.id,
        user_id: e.user_id ?? "",
        type: (e.kind ?? "report_synced") as Notification["type"],
        title: e.title,
        body: e.body,
        related_report_id: e.related_report_id,
        read_at: e.read_at,
        created_at: e.created_at,
      }));
      get().setNotifications(notifications);
    } catch {
      // silent fail — page handles its own error state
    }
  },
}));
