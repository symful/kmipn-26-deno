import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Notification } from "../types";

interface NotificationCenterProps {
  pollIntervalMs?: number;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;
  if (diffDay < 7) return `${diffDay} hari lalu`;
  return date.toLocaleDateString("id-ID");
}

export const NotificationCenter = ({ pollIntervalMs = 30000 }: NotificationCenterProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.notifications() as { entries: Array<{
        id: string; user_id: string | null; kind: string; title: string; body: string;
        related_report_id: string | null; read_at: string | null; created_at: string;
      }> };
      setNotifications((res.entries ?? []).map((e) => ({
        id: e.id,
        user_id: e.user_id ?? "",
        type: (e.kind ?? "report_synced") as Notification["type"],
        title: e.title,
        body: e.body,
        related_report_id: e.related_report_id,
        read_at: e.read_at,
        created_at: e.created_at,
      })));
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    if (pollIntervalMs > 0) {
      const interval = setInterval(fetchNotifications, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [fetchNotifications, pollIntervalMs]);

  // Refetch on visibility change and window focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    };
    const handleFocus = () => {
      fetchNotifications();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-sigap-surface transition-colors"
        aria-label="Notifikasi"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-sigap-text"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-sigap-surface border border-sigap-border rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-sigap-border flex justify-between items-center">
            <h3 className="font-semibold text-sigap-text">Notifikasi</h3>
            {notifications.length > 0 && (
              <button
                onClick={() => {
                  api.markAllNotificationsRead();
                  setNotifications((prev) =>
                    prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
                  );
                }}
                className="text-xs text-sigap-primary hover:underline"
              >
                Tandai semua baca
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="p-4 text-center text-sigap-text-muted">
                Memuat...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sigap-text-muted">
                Tidak ada notifikasi
              </div>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    onClick={() => {
                      if (!notification.read_at) {
                        api.markNotificationRead(notification.id);
                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === notification.id
                              ? { ...n, read_at: new Date().toISOString() }
                              : n
                          )
                        );
                      }
                    }}
                    className={`p-3 border-b border-sigap-border last:border-b-0 hover:bg-sigap-background transition-colors cursor-pointer ${
                      !notification.read_at ? "bg-sigap-primary/5" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-sigap-text truncate">
                          {notification.title}
                        </p>
                        <p className="text-xs text-sigap-text-muted mt-0.5 line-clamp-2">
                          {notification.body}
                        </p>
                      </div>
                      <span className="text-xs text-sigap-text-muted whitespace-nowrap">
                        {formatRelativeTime(notification.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
