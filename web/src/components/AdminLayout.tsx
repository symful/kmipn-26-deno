import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useNotificationStore } from "../stores/notification";
import { colors } from "../theme/tokens";

export const AdminLayout = () => {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const handleLogout = () => {
    useAuthStore.getState().clear();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SIGAP Admin</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/cases"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Daftar Kasus
            </Link>
            <Link
              to="/admin/priority"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Prioritas
            </Link>
            <Link
              to="/admin/outbox"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Outbox
            </Link>
            <Link
              to="/admin/settings"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Pengaturan
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-sigap-perluTindakan hover:underline"
            >
              Keluar
            </button>
            <Link
              to="/admin/notifications"
              className="relative p-2 rounded-lg hover:bg-sigap-background transition-colors"
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
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-danger-500 rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
      <main className="p-6 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
};
