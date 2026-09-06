import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, type ReactNode } from "react";
import { useAuthStore } from "../stores/auth";
import { useNotificationStore } from "../stores/notification";
import { api } from "../api/client";
import { logger } from "@/lib/logger";
import type { Role } from "../types";
import { colors, sidebarColors } from "../theme/tokens";
import { useBreakpoint } from "./design-system/breakpoints";
import { BellIcon, SearchIcon } from "../theme/icons";
import "../reference-layout.css";

const DcIcon = ({
  type,
  isActive,
}: {
  type: "grid" | "diamond" | "circle" | "square" | "l-shape" | "thick-top";
  isActive: boolean;
}) => {
  const borderColor = isActive
    ? colors.surface
    : sidebarColors.sidebarTextMuted;
  const size = 15;

  switch (type) {
    case "grid":
      return (
        <span
          style={{
            width: size,
            height: size,
            border: `2px solid ${borderColor}`,
            borderRadius: 4,
            flexShrink: 0,
          }}
        />
      );
    case "diamond":
      return (
        <span
          style={{
            width: 13,
            height: 13,
            border: `2px solid ${borderColor}`,
            borderRadius: 0,
            transform: "rotate(45deg)",
            flexShrink: 0,
          }}
        />
      );
    case "circle":
      return (
        <span
          style={{
            width: size,
            height: size,
            border: `2px solid ${borderColor}`,
            borderRadius: "50%",
            flexShrink: 0,
          }}
        />
      );
    case "square":
      return (
        <span
          style={{
            width: size,
            height: size,
            border: `2px solid ${borderColor}`,
            borderRadius: 3,
            flexShrink: 0,
          }}
        />
      );
    case "l-shape":
      return (
        <span
          style={{
            width: size,
            height: size,
            borderBottom: `2px solid ${borderColor}`,
            borderLeft: `2px solid ${borderColor}`,
            flexShrink: 0,
          }}
        />
      );
    case "thick-top":
      return (
        <span
          style={{
            width: size,
            height: size,
            border: `2px solid ${borderColor}`,
            borderRadius: 3,
            borderTopWidth: 5,
            flexShrink: 0,
          }}
        />
      );
    default:
      return null;
  }
};

const unifiedMainNavItems: {
  icon: "grid" | "diamond" | "circle" | "square" | "thick-top";
  label: string;
  path: string;
  badge?: boolean;
  roles: Role[];
}[] = [
  {
    icon: "grid",
    label: "Ringkasan",
    path: "/system/dashboard",
    roles: ["ADMIN"],
  },
  {
    icon: "diamond",
    label: "Peta & Kasus",
    path: "/system/cases",
    roles: ["ADMIN"],
  },
  {
    icon: "circle",
    label: "Antrean Verifikasi",
    path: "/system/queue",
    badge: true,
    roles: ["ADMIN"],
  },
  {
    icon: "square",
    label: "Tugas & Progres",
    path: "/system/tasks",
    roles: ["ADMIN"],
  },
  {
    icon: "circle",
    label: "Analitik & Heatmap",
    path: "/system/analitik",
    roles: ["ADMIN"],
  },
  {
    icon: "thick-top",
    label: "Ekspor Laporan",
    path: "/system/export",
    roles: ["ADMIN"],
  },
];

const unifiedBottomNavItems: {
  label: string;
  path: string;
  roles: Role[];
}[] = [
  { label: "Administrasi", path: "/system/priority", roles: ["ADMIN"] },
  { label: "Audit Log", path: "/system/audit", roles: ["ADMIN"] },
];

const getInitials = (name?: string | null): string => {
  if (!name) return "AD";
  const parts = name.trim().split(/\s+/);
  if ((parts?.length ?? 0) === 1 && parts[0])
    return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[(parts?.length ?? 0) - 1]?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "AD";
};

const getRegionLabel = (role: string | undefined): string => {
  switch (role) {
    case "ADMIN":
      return "Pemerintah Indonesia · Level Nasional";

    default:
      return "Pemerintah Indonesia · Level Nasional";
  }
};

export const Layout = ({ children }: { children?: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  useEffect(() => {
    const store = useNotificationStore.getState();
    store.reset();
    if (!user?.id) return;
    void store.fetchNotifications();
    const refresh = () => {
      if (document.visibilityState === "visible")
        void store.fetchNotifications();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    const pushMessage = (event: MessageEvent) => {
      if (event.data?.type === "SIGAP_NOTIFICATION")
        void store.fetchNotifications();
    };
    navigator.serviceWorker?.addEventListener("message", pushMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      navigator.serviceWorker?.removeEventListener("message", pushMessage);
      store.reset();
    };
  }, [user?.id]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bp = useBreakpoint();
  const [verificationCount, setVerificationCount] = useState(0);
  const [search, setSearch] = useState("");
  const [villages, setVillages] = useState<string[]>([]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let active = true;
    api
      .reports({ limit: 100 })
      .then(async (first) => {
        const remaining = await Promise.all(
          Array.from(
            {
              length: Math.max(
                0,
                Math.ceil((first.pagination?.total ?? 0) / 100) - 1,
              ),
            },
            (_, i) => api.reports({ page: i + 2, limit: 100 }),
          ),
        );
        if (active)
          setVillages(
            [
              ...new Set(
                [...first.data, ...remaining.flatMap((p) => p.data)]
                  .map((r) => r.village_name || r.kelurahan || "")
                  .filter(Boolean),
              ),
            ].sort(),
          );
      })
      .catch((error) => logger.error("Gagal memuat cakupan desa", { error }));
    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api
      .queueCounts()
      .then((counts) => setVerificationCount(counts.needs_verification))
      .catch((e) => {
        logger.error("Gagal memuat jumlah antrean", { error: e });
      });
  }, [user?.role, location.pathname]);

  const role = user?.role;
  const effectiveRole = role as Role | undefined;

  const mainNavItems = effectiveRole
    ? unifiedMainNavItems.filter((item) => item.roles.includes(effectiveRole))
    : unifiedMainNavItems;
  const bottomNav = effectiveRole
    ? unifiedBottomNavItems.filter((item) => item.roles.includes(effectiveRole))
    : unifiedBottomNavItems;

  const handleLogout = () => {
    useAuthStore.getState().clear();
    navigate("/login");
  };

  const regionLabel = getRegionLabel(role);

  const renderSidebarContent = () => (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 10px 32px",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            backgroundColor: colors.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.surface,
            fontWeight: 700,
            fontSize: 23,
          }}
        >
          S
        </div>
        <div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: colors.surface,
              letterSpacing: 1,
            }}
          >
            SIGAP
          </div>
          <div
            style={{
              fontSize: 10,
              color: colors.surface,
              opacity: 0.7,
              letterSpacing: 0.3,
            }}
          >
            PantauDesa
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "0",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          flex: 1,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: 1.7,
            color: "#81a59d",
            padding: 12,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: -5,
          }}
        >
          RUANG KERJA
        </div>
        {mainNavItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/system" &&
              location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                backgroundColor: isActive
                  ? sidebarColors.sidebarActiveBg
                  : "transparent",
                color: isActive ? colors.surface : sidebarColors.sidebarText,
                textDecoration: "none",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor =
                    sidebarColors.sidebarDivider;
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => {
                if (bp !== "desktop") setDrawerOpen(false);
              }}
            >
              <span
                style={{
                  width: 17,
                  textAlign: "center",
                  fontSize: 17,
                  color: "#9fc1b9",
                }}
              >
                {
                  {
                    grid: "▦",
                    diamond: "◇",
                    circle: item.path.includes("queue") ? "◎" : "⌁",
                    square: "▤",
                    "thick-top": "⇩",
                  }[item.icon]
                }
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && verificationCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    backgroundColor: colors.danger,
                    color: colors.surface,
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: "1px 7px",
                  }}
                  className="tnum"
                >
                  {verificationCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "auto",
          padding: "35px 0 0",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: 1.7,
            color: "#81a59d",
            padding: 12,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          TATA KELOLA
        </div>
        {bottomNav.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: isActive
                  ? colors.surface
                  : sidebarColors.sidebarTextMuted,
                textDecoration: "none",
                backgroundColor: isActive
                  ? sidebarColors.sidebarActiveBg
                  : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor =
                    sidebarColors.sidebarDivider;
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => {
                if (bp !== "desktop") setDrawerOpen(false);
              }}
            >
              <span style={{ width: 17, fontSize: 17, color: "#9fc1b9" }}>
                {item.label === "Administrasi" ? "⚙" : "≡"}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 9,
            fontSize: 13,
            color: sidebarColors.sidebarTextMuted,
            textDecoration: "none",
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              sidebarColors.sidebarDivider;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span>Keluar</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      className="ref-system-shell flex min-h-screen"
      style={{
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        backgroundColor: colors.bgOuter,
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
        style={{ backgroundColor: colors.primary }}
      >
        Langsung ke konten utama
      </a>

      {bp === "desktop" && (
        <aside
          style={{
            width: 222,
            backgroundColor: sidebarColors.sidebarBg,
            color: sidebarColors.sidebarText,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            padding: "25px 13px",
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          {renderSidebarContent()}
        </aside>
      )}

      {bp !== "desktop" && drawerOpen && (
        <>
          <button
            className="fixed inset-0 z-40 bg-black/40 cursor-default min-h-11"
            onClick={() => setDrawerOpen(false)}
            aria-label="Tutup menu"
            tabIndex={-1}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50"
            style={{
              width: 222,
              backgroundColor: sidebarColors.sidebarBg,
              color: sidebarColors.sidebarText,
              display: "flex",
              flexDirection: "column",
              padding: "25px 13px",
            }}
          >
            {renderSidebarContent()}
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="ref-system-topbar h-[70px] border-b flex items-center gap-[15px] px-7 shrink-0"
          style={{
            backgroundColor: colors.bgCard,
            borderColor: colors.borderNeutral,
          }}
        >
          {bp !== "desktop" && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center justify-center w-12 h-12 min-h-11 -ml-2 rounded-lg transition-colors"
              style={{ color: colors.textPrimary }}
              aria-label="Buka menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 5H17M3 10H17M3 15H17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          <select
            aria-label="Cakupan desa"
            value={new URLSearchParams(location.search).get("village_id") || ""}
            onChange={(event) => {
              const query = new URLSearchParams(
                location.pathname.includes("/cases") ? location.search : "",
              );
              event.target.value
                ? query.set("village_id", event.target.value)
                : query.delete("village_id");
              navigate(`/system/cases?${query}`);
            }}
            className="hidden sm:block rounded-lg px-3 py-2.5 text-xs font-semibold order-2"
            style={{
              backgroundColor: colors.primaryLight,
              border: `1px solid ${colors.primaryBorder}`,
              color: colors.primaryDark,
            }}
          >
            <option value="">
              Semua desa ·{" "}
              {new Date().toLocaleDateString("id-ID", {
                month: "short",
                year: "numeric",
              })}
            </option>
            {villages.map((village) => (
              <option key={village}>{village}</option>
            ))}
          </select>

          <div
            className="relative hidden sm:flex items-center order-1"
            style={{ width: 310, color: colors.textTertiary }}
          >
            <SearchIcon
              size={14}
              className="absolute left-3 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Cari laporan, desa, atau nomor laporan…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  navigate(
                    `/system/cases?search=${encodeURIComponent(search)}`,
                  );
              }}
              className="w-full rounded-lg text-xs outline-none transition-colors"
              style={{
                backgroundColor: colors.bgSurface,
                border: `1px solid ${colors.borderNeutral}`,
                padding: "10px 12px 10px 32px",
                fontSize: 12,
                color: colors.textSecondary,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = colors.borderNeutral;
              }}
            />
          </div>

          <div className="ml-auto flex items-center gap-3 order-3">
            <Link
              to="/system/notifications"
              className="relative p-2 rounded-lg transition-colors"
              style={{ color: colors.textSecondary }}
              aria-label={
                unreadCount
                  ? `Notifikasi, ${unreadCount} belum dibaca`
                  : "Notifikasi"
              }
            >
              <BellIcon size={16} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: colors.danger }}
                />
              )}
            </Link>

            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: colors.bgSoft,
                  color: colors.primaryDark,
                }}
              >
                {getInitials(user?.name)}
              </span>
              <div className="hidden md:block text-left leading-tight">
                <p
                  className="text-xs font-bold truncate max-w-[120px]"
                  style={{ color: colors.textPrimary }}
                >
                  {user?.name ?? "Admin"}
                </p>
                <p
                  className="text-[10px] font-semibold"
                  style={{ color: colors.textTertiary }}
                >
                  {user?.role === "ADMIN"
                    ? "Operator Kecamatan"
                    : user?.role === "PETUGAS"
                      ? "Petugas Lapangan"
                      : (user?.role ?? "—")}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="ref-system-content flex-1"
          style={{
            backgroundColor: colors.bgScreen,
            padding: "28px",
            maxWidth: 1700,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
};
