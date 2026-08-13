import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { NotificationCenter } from "./NotificationCenter";
import { RoleSwitcher } from "./RoleSwitcher";
import { colors } from "../theme/tokens";

export const AdminLayout = () => {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

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
            <button
              onClick={handleLogout}
              className="text-sm text-sigap-perluTindakan hover:underline"
            >
              Keluar
            </button>
            <NotificationCenter pollIntervalMs={30000} />
            <RoleSwitcher />
          </div>
        </div>
      </header>
      <main className="p-6 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
};
