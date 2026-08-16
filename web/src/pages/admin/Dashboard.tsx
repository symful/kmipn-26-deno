import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { DashboardStats, Report } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";
import { MiniMapCluster } from "../../components/MiniMapCluster";

const navItems = [
  { icon: "grid", label: "Ringkasan", path: "/admin", active: true },
  { icon: "map", label: "Peta & Kasus", path: "/admin/cases" },
  { icon: "queue", label: "Antrean Verifikasi", path: "/admin/verifikator", badge: 14 },
  { icon: "tasks", label: "Tugas & Progres", path: "/admin/petugas" },
  { icon: "chart", label: "Analitik", path: "/admin/analytics" },
  { icon: "export", label: "Ekspor", path: "/admin/export" },
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

export const AdminDashboard = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    api
      .reports()
      .then((data) => setReports(data.reports))
      .catch((e) => { logger.error("Failed to fetch reports", { error: e }); setReports([]); })
      .finally(() => setLoading(false));
    api
      .reportsStats()
      .then(setStats)
      .catch((e) => { logger.error("Failed to fetch stats", { error: e }); setStats(null); });
  }, []);

  const totalCases = stats?.total ?? 0;
  const newCases = stats?.by_status.submitted ?? 0;
  const pendingVerification = stats?.by_status.under_review ?? 0;
  const slaBreached = stats?.sla_breached ?? 0;
  const inProgress = (stats?.by_status.in_progress ?? 0) + (stats?.by_status.verified ?? 0) + (stats?.by_status.assigned ?? 0);

  const [backlog, setBacklog] = useState<Array<{ day: string; laporan_count: number; kasus_count: number }>>([]);

  useEffect(() => {
    api
      .operatorBacklog()
      .then(({ buckets }) => setBacklog(buckets))
      .catch((e) => { logger.error("Failed to fetch backlog", { error: e }); setBacklog([]); });
  }, []);

  const maxTrendValue = backlog.length > 0 ? Math.max(...backlog.flatMap(d => [d.laporan_count, d.kasus_count])) : 1;

  return (
    <div className="flex min-h-[100dvh] bg-[#f9faf8]">
      <aside className="w-[220px] bg-[#16302b] text-[#cfe4df] flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4 pb-5">
          <div className="w-8 h-8 rounded-lg bg-[#0f7a6b] flex items-center justify-center text-white font-bold text-base">
            P
          </div>
          <span className="text-base font-bold text-white">PantauDesa</span>
        </div>

        <nav className="px-3 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === item.path || (item.path === "/admin" && location.pathname === "/admin/dashboard")
                  ? "bg-[#0f7a6b] text-white"
                  : "hover:bg-[#234a43] text-[#cfe4df]"
              }`}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="ml-auto bg-[#c0392b] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t border-[#234a43]">
          {bottomNavItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm w-full hover:bg-[#234a43] transition-colors text-[#9dc0b9]"
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[#e4e7e2] flex items-center gap-4 px-6 shrink-0 bg-white">
          <div className="max-w-[360px] flex-1 bg-[#f4f5f3] border border-[#e4e7e2] rounded-lg px-3 py-2 flex items-center gap-2">
            <SearchIcon />
            <span className="text-xs text-[#8a9099]">Cari kasus, desa, atau ID…</span>
          </div>

          <div className="flex items-center gap-2 bg-[#e2f1ee] border border-[#bfe0d9] rounded-lg px-3 py-2 text-xs font-semibold text-[#0a5c50]">
            <span>Kec. Cisarua · Jul 2026</span>
            <span>▾</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#eef0ec] flex items-center justify-center text-xs font-bold text-[#0a5c50]">
              BM
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold">Apa yang harus ditangani hari ini?</h2>
            <p className="text-xs text-[#616770] mt-0.5">Data per 17 Jul 2026 08:40 WIB · cakupan 8 desa</p>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#2563eb] rounded-xl p-4">
              <div className="text-2xl font-bold">{totalCases}</div>
              <div className="text-xs text-[#616770] mt-0.5">Total kasus</div>
            </div>
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#b8730a] rounded-xl p-4">
              <div className="text-2xl font-bold text-[#8a5808]">{pendingVerification}</div>
              <div className="text-xs text-[#616770] mt-0.5">Perlu verifikasi</div>
            </div>
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#c0392b] rounded-xl p-4">
              <div className="text-2xl font-bold text-[#a5271a]">{slaBreached}</div>
              <div className="text-xs text-[#616770] mt-0.5">SLA terlewat</div>
            </div>
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#0f7a6b] rounded-xl p-4">
              <div className="text-2xl font-bold text-[#0a5c50]">{inProgress}</div>
              <div className="text-xs text-[#616770] mt-0.5">Sedang diproses</div>
            </div>
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#8a9099] rounded-xl p-4">
              <div className="text-2xl font-bold">{newCases}</div>
              <div className="text-xs text-[#616770] mt-0.5">Kasus baru</div>
            </div>
          </div>

          <div className="grid grid-cols-[1.5fr_1fr] gap-5 flex-1 min-h-0">
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-[#e4e7e2] rounded-xl p-4">
                <div className="flex justify-between items-baseline mb-4">
                  <span className="text-sm font-bold">Umur backlog kasus</span>
                  <span className="text-xs text-[#616770]">30 hari · <b className="text-[#17191c]">laporan</b> vs <b className="text-[#17191c]">kasus</b></span>
                </div>
                <div className="flex items-end gap-1.5 h-28">
                  {backlog.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end gap-0.5">
                      <div className="flex flex-col gap-0.5 justify-end" style={{ height: "110px" }}>
                        <div
                          className="w-full bg-[#c7d7fb] rounded-t-sm"
                          style={{ height: `${maxTrendValue > 0 ? (d.laporan_count / maxTrendValue) * 100 : 0}%` }}
                        />
                        <div
                          className="w-full bg-[#0f7a6b] rounded-t-sm"
                          style={{ height: `${maxTrendValue > 0 ? (d.kasus_count / maxTrendValue) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#e4e7e2] rounded-xl p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-baseline mb-3">
                  <span className="text-sm font-bold">Peta ringkas kasus</span>
                  <Link to="/admin/cases?view=map" className="text-xs text-[#0f7a6b] font-semibold">Buka Peta & Kasus →</Link>
                </div>
                <div className="flex-1 rounded-lg min-h-[150px]">
                  <MiniMapCluster className="w-full h-full min-h-[150px]" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 min-h-0">
              <div className="bg-white border border-[#e4e7e2] rounded-xl p-4 flex-1 flex flex-col">
                <span className="text-sm font-bold mb-3">Kasus kritis</span>
                <div className="flex flex-col gap-0">
                  <div className="flex gap-2.5 items-center pb-3 border-b border-[#eef0ec]">
                    <span className="w-2 h-2 rounded-full bg-[#c0392b] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">Jembatan retak RW 07</div>
                      <div className="text-[11px] text-[#616770]">CB-1790 · Ds. Kaler</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#a5271a]">SLA -1h</span>
                  </div>
                  <div className="flex gap-2.5 items-center py-3 border-b border-[#eef0ec]">
                    <span className="w-2 h-2 rounded-full bg-[#c0392b] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">Jalan longsor akses utama</div>
                      <div className="text-[11px] text-[#616770]">CB-1802 · Ds. Girang</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#a5271a]">SLA -3h</span>
                  </div>
                  <div className="flex gap-2.5 items-center py-3 border-b border-[#eef0ec]">
                    <span className="w-2 h-2 rounded-full bg-[#b8730a] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">Air keruh 3 dusun</div>
                      <div className="text-[11px] text-[#616770]">CB-1811 · Ds. Ciburuy</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#8a5808]">SLA 2j</span>
                  </div>
                  <div className="flex gap-2.5 items-center pt-3">
                    <span className="w-2 h-2 rounded-full bg-[#b8730a] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">Penerangan jalan mati</div>
                      <div className="text-[11px] text-[#616770]">CB-1815 · Ds. Wetan</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#8a5808]">SLA 5j</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#e4e7e2] rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold">Kualitas & sinkronisasi data</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-xl font-bold text-[#0a5c50]">98%</div>
                    <div className="text-[11px] text-[#616770] leading-tight mt-0.5">Laporan tersinkron</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xl font-bold text-[#8a5808]">7</div>
                    <div className="text-[11px] text-[#616770] leading-tight mt-0.5">Menunggu koneksi surveyor</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#e4e7e2] rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold">Laporan terbaru</span>
                  <Link to="/admin/cases" className="text-xs text-[#0f7a6b] font-semibold">Lihat semua →</Link>
                </div>
                <div className="flex flex-col gap-2">
                  {loading ? (
                    <p className="text-xs text-[#8a9099] text-center py-4">Memuat...</p>
                  ) : reports.slice(0, 5).map((r) => (
                    <Link
                      key={r.id}
                      to={`/admin/cases/${r.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#f4f5f3] transition-colors"
                    >
                      <span className="w-8 h-8 rounded-lg bg-[#e2f1ee] text-[#0a5c50] flex items-center justify-center text-[11px] font-bold shrink-0">
                        {r.category?.name?.slice(0, 2).toUpperCase() ?? "CS"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{r.category?.name ?? r.category_id}</div>
                        <div className="text-[10px] text-[#616770]">{new Date(r.created_at).toLocaleDateString("id-ID")}</div>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
