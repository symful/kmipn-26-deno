import { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client";
import { useNotificationStore } from "../../stores/notification";
import { logger } from "@/lib/logger";

type NotificationEntry = {
  id: string;
  user_id: string | null;
  kind: string;
  title: string;
  body: string;
  related_report_id: string | null;
  read_at: string | null;
  created_at: string;
};

type Tab = "all" | "unread" | "read";

const KIND_ICONS: Record<string, string> = {
  case_assigned: "M10 18a8 8 0 100-16 8 8 0 000 16zm1-13h-2V5h2v2zm0 4h-2v6h2v-6z",
  status_changed: "M10 18a8 8 0 100-16 8 8 0 000 16zm3-9h-8v2h8v-2zM7 11h2v2H7v-2zm6-4h2v6h-2V7z",
  new_comment: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z",
  report_synced: "M4 4h16v12H4V4zm0 14h16v2H4v-2zm2-8h12v4H6V10z",
};

const BellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface NotificationRowProps {
  notification: NotificationEntry;
  onMarkRead: (id: string) => void;
  markingReadId: string | null;
}

const NotificationRow = ({ notification, onMarkRead, markingReadId }: NotificationRowProps) => {
  const isUnread = !notification.read_at;
  const iconPath = KIND_ICONS[notification.kind] ?? KIND_ICONS.report_synced;

  return (
    <div
      className={`flex items-start gap-4 p-4 border-b border-sigap-border last:border-b-0 transition-colors ${
        isUnread ? "bg-sigap-primary/5" : "bg-white hover:bg-sigap-background"
      }`}
    >
      <div
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isUnread ? "bg-sigap-primary/10 text-sigap-primary" : "bg-sigap-border text-sigap-textMuted"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d={iconPath} clipRule="evenodd" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isUnread ? "text-sigap-textPrimary" : "text-sigap-textSecondary"}`}>
              {notification.title}
            </p>
            <p className="text-xs text-sigap-textMuted mt-1 line-clamp-2">
              {notification.body}
            </p>
          </div>
          {isUnread && (
            <button
              onClick={() => onMarkRead(notification.id)}
              disabled={markingReadId === notification.id}
              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-sigap-primary text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {markingReadId === notification.id ? (
                <span>...</span>
              ) : (
                <>
                  <CheckIcon />
                  <span>Baca</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {notification.related_report_id && (
            <a
              href={`/admin/cases/${notification.related_report_id}`}
              className="text-xs text-sigap-primary hover:underline font-medium"
            >
              Lihat Kasus
            </a>
          )}
          <span className="text-xs text-sigap-textMuted">
            {formatDate(notification.created_at)}
          </span>
          {notification.read_at && (
            <span className="text-xs text-sigap-textMuted">
              Dibaca {formatDate(notification.read_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const NotificationList = () => {
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const limit = 20;

  const { markAsRead, markAllAsRead } = useNotificationStore();

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.notifications() as { entries: NotificationEntry[] };
      setNotifications(res.entries ?? []);
      setTotal(res.entries?.length ?? 0);
    } catch (e) {
      logger.error("Failed to fetch notifications", { error: e });
      setError("Gagal memuat notifikasi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    setMarkingReadId(id);
    try {
      await api.markNotificationRead(id);
      markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch (e) {
      logger.error("Failed to mark notification as read", { error: e });
    } finally {
      setMarkingReadId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkAllLoading(true);
    try {
      await api.markAllNotificationsRead();
      markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
      );
    } catch (e) {
      logger.error("Failed to mark all notifications as read", { error: e });
    } finally {
      setMarkAllLoading(false);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return !n.read_at;
    if (activeTab === "read") return !!n.read_at;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const displayedNotifications = filteredNotifications.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(filteredNotifications.length / limit);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "all", label: "Semua", count: notifications.length },
    { key: "unread", label: "Belum Dibaca", count: unreadCount },
    { key: "read", label: "Sudah Dibaca", count: notifications.length - unreadCount },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-sigap-surface">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-sigap-border flex items-center gap-4 px-6 shrink-0 bg-white">
          <div className="flex items-center gap-2 text-sigap-textMuted">
            <BellIcon />
            <span className="text-sm font-medium">Notifikasi</span>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-sigap-textPrimary">Riwayat Notifikasi</h2>
              <p className="text-xs text-sigap-textTertiary mt-0.5">
                {unreadCount > 0 ? `${unreadCount} notifikasi belum dibaca` : "Semua notifikasi sudah dibaca"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markAllLoading}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-sigap-border bg-white text-sigap-textPrimary hover:bg-sigap-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {markAllLoading ? "Memproses..." : "Tandai Semua Baca"}
              </button>
            )}
          </div>

          <div className="flex items-center border-b border-sigap-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? "text-sigap-primary border-b-2 border-sigap-primary"
                    : "text-sigap-textMuted hover:text-sigap-textTertiary"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" && tab.count > 0 && (
                  <span className="ml-1.5 text-xs bg-sigap-border text-sigap-textMuted rounded-full px-1.5 py-0.5">
                    {tab.count}
                  </span>
                )}
                {tab.key === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 bg-danger-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-danger-100 border border-danger-200 text-sm text-danger-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
              <p className="text-sigap-textMuted">Memuat...</p>
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-full bg-sigap-border flex items-center justify-center text-sigap-textMuted">
                  <BellIcon />
                </div>
              </div>
              <p className="text-sigap-textMuted">
                {activeTab === "unread"
                  ? "Tidak ada notifikasi yang belum dibaca"
                  : activeTab === "read"
                  ? "Tidak ada notifikasi yang sudah dibaca"
                  : "Tidak ada notifikasi"}
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-sigap-border overflow-hidden">
                {displayedNotifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onMarkRead={handleMarkRead}
                    markingReadId={markingReadId}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-sigap-border text-sm bg-white text-sigap-textTertiary disabled:opacity-50 hover:bg-sigap-background transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-sm text-sigap-textTertiary">
                    Halaman {page} dari {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 rounded-lg border border-sigap-border text-sm bg-white text-sigap-textTertiary disabled:opacity-50 hover:bg-sigap-background transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
