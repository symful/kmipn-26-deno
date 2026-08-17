import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import type { QueueCounts, DashboardStats } from "../../types";
import { MiniMapCluster } from "../../components/MiniMapCluster";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { logger } from "@/lib/logger";
import {
  sidebarBg,
  sidebarText,
  sidebarTextHover,
  sidebarTextMuted,
  sidebarDivider,
  sidebarAccent,
  colors,
  extendedColors,
} from "../../theme/tokens";

const navItems = [
  { icon: "grid", label: "Ringkasan", path: "/operator", active: true },
  { icon: "map", label: "Peta & Kasus", path: "/operator/cases" },
  { icon: "queue", label: "Antrean Verifikasi", path: "/operator/verifikator", badge: 14 },
  { icon: "tasks", label: "Tugas & Progres", path: "/operator/petugas" },
  { icon: "chart", label: "Analitik", path: "/operator/analytics" },
  { icon: "export", label: "Ekspor", path: "/operator/export" },
];

const bottomNavItems = [
  { icon: "settings", label: "Administrasi" },
  { icon: "audit", label: "Audit Log" },
];

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="1" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const MapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1L13 4V10L7 13L1 10V4L7 1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

const QueueIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2"/>
  </svg>
);

const TasksIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const ChartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 13V7M5 13V4M9 13V9M13 13V1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1V9M4 6L7 9L10 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 10V12H12V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M7 1V3M7 11V13M1 7H3M11 7H13M2.93 2.93L4.34 4.34M9.66 9.66L11.07 11.07M2.93 11.07L4.34 9.66M9.66 4.34L11.07 2.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const AuditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="2"/>
    <path d="M4 1V3M10 1V3M1 6H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="2"/>
    <path d="M9 9L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const NavIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "grid": return <GridIcon />;
    case "map": return <MapIcon />;
    case "queue": return <QueueIcon />;
    case "tasks": return <TasksIcon />;
    case "chart": return <ChartIcon />;
    case "export": return <ExportIcon />;
    case "settings": return <SettingsIcon />;
    case "audit": return <AuditIcon />;
    default: return <GridIcon />;
  }
};

export const OperatorDashboard = () => {
  const [queueCounts, setQueueCounts] = useState<QueueCounts | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const fetchData = useCallback(async () => {
    try {
      const [countsData, statsData] = await Promise.all([
        api.queueCounts(),
        api.reportsStats(),
      ]);
      setQueueCounts(countsData);
      setStats(statsData);
    } catch (err) {
      logger.error("Failed to fetch dashboard data", { error: err });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [backlog, setBacklog] = useState<Array<{ day: string; laporan_count: number; kasus_count: number }>>([]);

  useEffect(() => {
    api
      .operatorBacklog()
      .then(({ buckets }) => setBacklog(buckets))
      .catch((e) => { logger.error("Failed to fetch backlog", { error: e }); setBacklog([]); });
  }, []);

  const maxTrendValue = backlog.length > 0 ? Math.max(...backlog.flatMap(d => [d.laporan_count, d.kasus_count])) : 1;

  // Get initials for avatar
  const getInitials = (name: string | undefined) => {
    if (!name) return "OP";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex min-h-[100dvh]" style={{ backgroundColor: extendedColors.bgScreen }}>
      {/* Sidebar */}
      <aside
        className="w-[220px] flex flex-col shrink-0"
        style={{ backgroundColor: sidebarBg, color: sidebarText }}
      >
        <div className="flex items-center gap-2.5 px-4 py-4 pb-5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-base"
            style={{ backgroundColor: sidebarAccent }}
          >
            P
          </div>
          <span className="text-base font-bold" style={{ color: sidebarTextHover }}>PantauDesa</span>
        </div>

        <nav className="px-3 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === item.path || (item.path === "/operator" && location.pathname === "/operator/dashboard")
                  ? "bg-[#0f7a6b] text-white"
                  : "hover:bg-[#234a43] text-[#cfe4df]"
              }`}
              style={{
                backgroundColor: location.pathname === item.path || (item.path === "/operator" && location.pathname === "/operator/dashboard")
                  ? sidebarAccent
                  : "transparent",
                color: location.pathname === item.path || (item.path === "/operator" && location.pathname === "/operator/dashboard")
                  ? sidebarTextHover
                  : sidebarText,
              }}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className="ml-auto text-white text-[10px] font-bold rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: colors.danger }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t" style={{ borderColor: sidebarDivider }}>
          {bottomNavItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full transition-colors"
              style={{ color: sidebarTextMuted }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = sidebarDivider}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="h-14 border-b flex items-center gap-4 px-6 shrink-0 bg-white"
          style={{ borderColor: colors.border }}
        >
          <div
            className="max-w-[360px] flex-1 rounded-lg px-3 py-2 flex items-center gap-2"
            style={{ backgroundColor: colors.bgSurface, borderColor: colors.border }}
          >
            <SearchIcon />
            <span className="text-xs" style={{ color: colors.textMuted }}>Cari kasus, desa, atau ID…</span>
          </div>

          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ backgroundColor: colors.primaryLight, borderColor: extendedColors.successBorder, color: colors.primaryDark }}
          >
            <span>Kec. Cisarua · Jul 2026</span>
            <span>▾</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: extendedColors.bgSoft, color: colors.primaryDark }}
            >
              {getInitials(user?.name)}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5">
          {/* Hero section */}
          <div>
            <h2 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Apa yang harus ditangani hari ini?</h2>
            <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Data per 17 Jul 2026 08:40 WIB · cakupan 8 desa</p>
          </div>

          {/* Stats cards */}
          {queueCounts && (
            <div className="grid grid-cols-5 gap-3">
              <div
                className="bg-white rounded-[11px] p-[14px]"
                style={{ borderColor: colors.border, borderWidth: "1px", borderTopWidth: "3px", borderTopColor: colors.diproses }}
              >
                <div className="text-[26px] font-bold tnum" style={{ color: colors.textPrimary }}>{queueCounts.new_reports}</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Kasus baru</div>
              </div>
              <div
                className="bg-white rounded-[11px] p-[14px]"
                style={{ borderColor: colors.border, borderWidth: "1px", borderTopWidth: "3px", borderTopColor: colors.warning }}
              >
                <div className="text-[26px] font-bold tnum" style={{ color: extendedColors.warningText }}>{queueCounts.needs_verification}</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Perlu verifikasi</div>
              </div>
              <div
                className="bg-white rounded-[11px] p-[14px]"
                style={{ borderColor: colors.border, borderWidth: "1px", borderTopWidth: "3px", borderTopColor: colors.danger }}
              >
                <div className="text-[26px] font-bold tnum" style={{ color: extendedColors.dangerTextStrong }}>{queueCounts.sla_breached}</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>SLA terlewat</div>
              </div>
              <div
                className="bg-white rounded-[11px] p-[14px]"
                style={{ borderColor: colors.border, borderWidth: "1px", borderTopWidth: "3px", borderTopColor: colors.primary }}
              >
                <div className="text-[26px] font-bold tnum" style={{ color: colors.primaryDark }}>{queueCounts.high_priority}</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Prioritas tinggi</div>
              </div>
              <div
                className="bg-white rounded-[11px] p-[14px]"
                style={{ borderColor: colors.border, borderWidth: "1px", borderTopWidth: "3px", borderTopColor: colors.textMuted }}
              >
                <div className="text-[26px] font-bold tnum" style={{ color: colors.textPrimary }}>{queueCounts.needs_completion}</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Perlu kelengkapan</div>
              </div>
            </div>
          )}

          {/* Two column layout */}
          <div className="grid grid-cols-[1.5fr_1fr] gap-5 flex-1 min-h-0">
            {/* Left column: Backlog chart + Map */}
            <div className="flex flex-col gap-4">
              {/* Backlog chart */}
              <div className="bg-white rounded-[12px] p-4" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                <div className="flex justify-between items-baseline mb-[14px]">
                  <span className="text-[13.5px] font-bold" style={{ color: colors.textPrimary }}>Umur backlog kasus</span>
                  <span className="text-[11px]" style={{ color: colors.textTertiary }}>30 hari · <b style={{ color: colors.textPrimary }}>laporan</b> vs <b style={{ color: colors.textPrimary }}>kasus</b></span>
                </div>
                <div className="flex items-end gap-[5px] h-[110px]">
                  {backlog.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end gap-[2px]">
                      <div
                        className="w-full rounded-[2px_2px_0_0]"
                        style={{ height: `${maxTrendValue > 0 ? (d.laporan_count / maxTrendValue) * 100 : 0}%`, backgroundColor: extendedColors.infoChartBar }}
                      />
                      <div
                        className="w-full rounded-[2px_2px_0_0]"
                        style={{ height: `${maxTrendValue > 0 ? (d.kasus_count / maxTrendValue) * 100 : 0}%`, backgroundColor: colors.primary }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini map */}
              <div className="bg-white rounded-[12px] p-4 flex-1 flex flex-col" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                <div className="flex justify-between items-baseline mb-[10px]">
                  <span className="text-[13.5px] font-bold" style={{ color: colors.textPrimary }}>Peta ringkas kasus</span>
                  <Link
                    to="/operator/cases?view=map"
                    className="text-[12px] font-semibold"
                    style={{ color: colors.primary }}
                  >
                    Buka Peta &amp; Kasus →
                  </Link>
                </div>
                <div className="flex-1 rounded-[9px] min-h-[150px]">
                  <MiniMapCluster className="w-full h-full min-h-[150px]" />
                </div>
              </div>
            </div>

            {/* Right column: Critical cases + Data quality + Recent reports */}
            <div className="flex flex-col gap-4 min-h-0">
              {/* Critical cases */}
              <div className="bg-white rounded-[12px] p-4 flex-1 flex flex-col" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                <span className="text-[13.5px] font-bold mb-3" style={{ color: colors.textPrimary }}>Kasus kritis</span>
                <div className="flex flex-col gap-0">
                  <div className="flex gap-[10px] items-center pb-[11px] border-b" style={{ borderColor: extendedColors.bgSoft }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.danger }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate" style={{ color: colors.textPrimary }}>Jembatan retak RW 07</div>
                      <div className="text-[11px]" style={{ color: colors.textTertiary }}>CB-1790 · Ds. Kaler</div>
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: extendedColors.dangerTextStrong }}>SLA -1h</span>
                  </div>
                  <div className="flex gap-[10px] items-center py-[11px] border-b" style={{ borderColor: extendedColors.bgSoft }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.danger }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate" style={{ color: colors.textPrimary }}>Jalan longsor akses utama</div>
                      <div className="text-[11px]" style={{ color: colors.textTertiary }}>CB-1802 · Ds. Girang</div>
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: extendedColors.dangerTextStrong }}>SLA -3h</span>
                  </div>
                  <div className="flex gap-[10px] items-center py-[11px] border-b" style={{ borderColor: extendedColors.bgSoft }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.warning }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate" style={{ color: colors.textPrimary }}>Air keruh 3 dusun</div>
                      <div className="text-[11px]" style={{ color: colors.textTertiary }}>CB-1811 · Ds. Ciburuy</div>
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: extendedColors.warningText }}>SLA 2j</span>
                  </div>
                  <div className="flex gap-[10px] items-center pt-[11px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.warning }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate" style={{ color: colors.textPrimary }}>Penerangan jalan mati</div>
                      <div className="text-[11px]" style={{ color: colors.textTertiary }}>CB-1815 · Ds. Wetan</div>
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: extendedColors.warningText }}>SLA 5j</span>
                  </div>
                </div>
              </div>

              {/* Data quality card */}
              <div className="bg-white rounded-[12px] p-4" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                <div className="flex justify-between items-center mb-[10px]">
                  <span className="text-[13.5px] font-bold" style={{ color: colors.textPrimary }}>Kualitas &amp; sinkronisasi data</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-[20px] font-bold" style={{ color: colors.primaryDark }}>98%</div>
                    <div className="text-[11px] leading-tight mt-px" style={{ color: colors.textTertiary }}>Laporan tersinkron</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[20px] font-bold" style={{ color: extendedColors.warningText }}>7</div>
                    <div className="text-[11px] leading-tight mt-px" style={{ color: colors.textTertiary }}>Menunggu koneksi surveyor</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};