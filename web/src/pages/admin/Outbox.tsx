import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";

type OutboxEntry = {
  id: string;
  created_at: string;
  target_system: string;
  payload: unknown;
  status: string;
  retry_count: number;
  last_attempt_at: string | null;
  error_message: string | null;
  related_report_id: string | null;
};

type DlqEntry = {
  id: string;
  created_at: string;
  target_system: string;
  last_error: string | null;
  retry_count: number;
  related_report_id: string | null;
  next_retry_at: string | null;
};

type OutboxStats = Record<string, Record<string, number>>;

type Tab = "events" | "dlq";

const STATUS_LABELS: Record<string, string> = {
  pending: "Tertunda",
  sent: "Terkirim",
  failed: "Gagal",
  dead_letter: "Dead Letter",
  skipped: "Dilewati",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#b8730a",
  sent: "#0f7a6b",
  failed: "#c0392b",
  dead_letter: "#7c3aed",
  skipped: "#8a9099",
};

interface StatusPillProps {
  status: string;
}

const StatusPill = ({ status }: StatusPillProps) => {
  const color = STATUS_COLORS[status] ?? "#8a9099";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: color + "20", color }}
    >
      {label}
    </span>
  );
};

interface OutboxRowProps {
  entry: OutboxEntry;
  onRetry: (id: string) => void;
  actionLoading: string | null;
}

const OutboxRow = ({ entry, onRetry, actionLoading }: OutboxRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const payloadSummary = entry.payload
    ? JSON.stringify(entry.payload).slice(0, 80) +
      (JSON.stringify(entry.payload).length > 80 ? "..." : "")
    : "-";

  return (
    <tr className="border-b border-sigap-border hover:bg-sigap-background transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-sigap-textTertiary">
          {entry.id.slice(0, 8)}...
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-sigap-textPrimary">
        {entry.target_system ?? "-"}
      </td>
      <td className="px-4 py-3">
        <StatusPill status={entry.status} />
      </td>
      <td className="px-4 py-3 text-sm text-center text-sigap-textTertiary">
        {entry.retry_count}
      </td>
      <td className="px-4 py-3 text-xs text-danger-500 max-w-[180px] truncate">
        {entry.error_message ?? "-"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {(entry.status === "failed" || entry.status === "dead_letter") && (
            <button
              onClick={() => onRetry(entry.id)}
              disabled={actionLoading === entry.id}
              className="text-xs px-3 py-1.5 rounded-lg bg-sigap-primary text-white font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === entry.id ? "..." : "Retry"}
            </button>
          )}
          {!!entry.payload && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-sigap-primary hover:underline font-medium"
            >
              {expanded ? "Sembunyikan" : "Detail"}
            </button>
          )}
        </div>
        {expanded && !!entry.payload && (
          <div className="mt-2">
            <pre className="text-xs font-mono bg-sigap-border p-3 rounded-lg overflow-x-auto max-w-[400px] text-sigap-textSecondary">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </div>
        )}
      </td>
    </tr>
  );
};

interface DlqRowProps {
  entry: DlqEntry;
  onReset: (id: string) => void;
  actionLoading: string | null;
}

const DlqRow = ({ entry, onReset, actionLoading }: DlqRowProps) => {
  return (
    <tr className="border-b border-sigap-border hover:bg-sigap-background transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-sigap-textTertiary">
          {entry.id.slice(0, 8)}...
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-sigap-textPrimary">
        {entry.target_system ?? "-"}
      </td>
      <td className="px-4 py-3 text-sm text-center text-sigap-textTertiary">
        {entry.retry_count}
      </td>
      <td className="px-4 py-3 text-xs text-danger-500 max-w-[180px] truncate">
        {entry.last_error ?? "-"}
      </td>
      <td className="px-4 py-3 text-xs text-sigap-textTertiary">
        {entry.next_retry_at
          ? new Date(entry.next_retry_at).toLocaleString("id-ID")
          : "-"}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onReset(entry.id)}
          disabled={actionLoading === entry.id}
          className="text-xs px-3 py-1.5 rounded-lg border border-sigap-border bg-white text-sigap-textPrimary font-medium hover:bg-sigap-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading === entry.id ? "..." : "Reset"}
        </button>
      </td>
    </tr>
  );
};

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="1" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const BoxIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 4h12M1 4l2-2h8l2 2M1 4v7h12V4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M5 8v3M9 8v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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

const NavIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "grid": return <GridIcon />;
    case "box": return <BoxIcon />;
    case "map": return <MapIcon />;
    case "queue": return <QueueIcon />;
    default: return <GridIcon />;
  }
};

const navItems = [
  { icon: "grid", label: "Ringkasan", path: "/admin" },
  { icon: "box", label: "Outbox", path: "/admin/outbox", active: true },
  { icon: "map", label: "Peta & Kasus", path: "/admin/cases" },
  { icon: "queue", label: "Antrean Verifikasi", path: "/admin/verifikator" },
];

export const AdminOutbox = () => {
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [dlqEntries, setDlqEntries] = useState<DlqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dlqPage, setDlqPage] = useState(1);
  const [dlqTotal, setDlqTotal] = useState(0);
  const [limit] = useState(20);
  const [stats, setStats] = useState<OutboxStats | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);

  const user = { name: "Admin", role: "ADMIN" };

  const fetchStats = () => {
    api
      .outboxStats()
      .then((data) => {
        setStats(data.stats);
      })
      .catch((e) => {
        logger.error("Failed to fetch outbox stats", { error: e });
        setStats(null);
      });
  };

  const fetchEntries = () => {
    setLoading(true);
    setError(null);
    api
      .outboxList({ page, limit })
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch((e) => {
        logger.error("Failed to fetch outbox entries", { error: e });
        setError("Gagal memuat data outbox");
      })
      .finally(() => setLoading(false));
  };

  const fetchDlq = () => {
    setLoading(true);
    setError(null);
    api
      .outboxDlq({ page: dlqPage, limit })
      .then((data) => {
        setDlqEntries(data.items);
        setDlqTotal(data.total);
      })
      .catch((e) => {
        logger.error("Failed to fetch dead letter queue", { error: e });
        setError("Gagal memuat data dead letter");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === "dlq") {
      fetchDlq();
    } else {
      fetchEntries();
    }
  }, [activeTab, page, dlqPage]);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      await api.outboxRetry(id);
      fetchEntries();
      fetchStats();
    } catch (e) {
      logger.error("Failed to retry outbox entry", { error: e });
      setError("Gagal menjalankan retry");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async (id: string) => {
    setActionLoading(id);
    try {
      await api.outboxReset(id);
      fetchDlq();
      fetchStats();
    } catch (e) {
      logger.error("Failed to reset outbox entry", { error: e });
      setError("Gagal mereset entri");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcile = async () => {
    setReconcileLoading(true);
    try {
      await api.outboxReconcile();
      fetchStats();
      if (activeTab === "dlq") {
        fetchDlq();
      } else {
        fetchEntries();
      }
    } catch (e) {
      logger.error("Failed to reconcile outbox", { error: e });
      setError(e instanceof Error ? e.message : "Gagal menjalankan rekonsiliasi");
    } finally {
      setReconcileLoading(false);
    }
  };

  const computeStats = () => {
    if (!stats) return { pending: 0, failed: 0, success: 0 };
    let pending = 0;
    let failed = 0;
    let success = 0;
    for (const statusMap of Object.values(stats)) {
      pending += statusMap["pending"] ?? 0;
      failed += statusMap["failed"] ?? 0;
      success += statusMap["sent"] ?? 0;
    }
    return { pending, failed, success };
  };

  const { pending, failed, success } = computeStats();

  const tabs: { key: Tab; label: string }[] = [
    { key: "events", label: "Events" },
    { key: "dlq", label: "DLQ" },
  ];

  const currentPage = activeTab === "dlq" ? dlqPage : page;
  const currentTotal = activeTab === "dlq" ? dlqTotal : total;
  const setCurrentPage = activeTab === "dlq" ? setDlqPage : setPage;

  return (
    <div className="flex min-h-[100dvh] bg-sigap-surface">
      {/* Sidebar */}
      <aside className="w-[220px] bg-surface-sidebar text-sigap-textMuted flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4 pb-5">
          <div className="w-8 h-8 rounded-lg bg-sigap-primary flex items-center justify-center text-white font-bold text-base">
            P
          </div>
          <span className="text-base font-bold text-white">PantauDesa</span>
        </div>

        <nav className="px-3 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? "bg-sigap-primary text-white"
                  : "hover:bg-[#234A43] text-sigap-textMuted"
              }`}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t border-[#234A43]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#9DC0B9]">
            <span className="w-8 h-8 rounded-full bg-sigap-primary flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.slice(0, 2).toUpperCase() ?? "AD"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-white">{user?.name ?? "Admin"}</div>
              <div className="text-[10px] text-[#9DC0B9] truncate">{user?.role ?? "ADMIN"}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-sigap-border flex items-center gap-4 px-6 shrink-0 bg-white">
          <div className="ml-auto flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-bold text-primary-600">
              {user?.name?.slice(0, 2).toUpperCase() ?? "AD"}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5">
          {/* Page Title */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-sigap-textPrimary">Outbox</h2>
              <p className="text-xs text-sigap-textTertiary mt-0.5">Kelola event keluar dan dead letter queue</p>
            </div>
            <button
              onClick={handleReconcile}
              disabled={reconcileLoading}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-sigap-primary text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reconcileLoading ? "Memproses..." : "Reconcile"}
            </button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-sigap-border border-t-[3px] border-t-warning-500 rounded-xl p-4">
              <div className="text-2xl font-bold text-warning-600">{pending}</div>
              <div className="text-xs text-sigap-textTertiary mt-0.5">Pending</div>
            </div>
            <div className="bg-white border border-sigap-border border-t-[3px] border-t-danger-500 rounded-xl p-4">
              <div className="text-2xl font-bold text-danger-600">{failed}</div>
              <div className="text-xs text-sigap-textTertiary mt-0.5">Failed</div>
            </div>
            <div className="bg-white border border-sigap-border border-t-[3px] border-t-sigap-primary rounded-xl p-4">
              <div className="text-2xl font-bold text-primary-600">{success}</div>
              <div className="text-xs text-sigap-textTertiary mt-0.5">Success</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center border-b border-sigap-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                  setDlqPage(1);
                }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? "text-sigap-primary border-b-2 border-sigap-primary"
                    : "text-sigap-textMuted hover:text-sigap-textTertiary"
                }`}
              >
                {tab.label}
                {tab.key === "dlq" && failed > 0 && (
                  <span className="ml-1.5 bg-danger-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {failed}
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

          {activeTab === "events" && (
            <>
              {loading ? (
                <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
                  <p className="text-sigap-textMuted">Memuat...</p>
                </div>
              ) : entries.length === 0 ? (
                <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
                  <p className="text-sigap-textMuted">Tidak ada event.</p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-sigap-border overflow-hidden">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="bg-sigap-background border-b border-sigap-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            ID
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Target
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Status
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Attempts
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Last Error
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <OutboxRow
                            key={entry.id}
                            entry={entry}
                            onRetry={handleRetry}
                            actionLoading={actionLoading}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {currentTotal > limit && (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-sigap-border text-sm bg-white text-sigap-textTertiary disabled:opacity-50 hover:bg-sigap-background transition-colors"
                      >
                        Prev
                      </button>
                      <span className="text-sm text-sigap-textTertiary">
                        Halaman {currentPage} dari {Math.ceil(currentTotal / limit)}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={currentPage * limit >= currentTotal}
                        className="px-3 py-1.5 rounded-lg border border-sigap-border text-sm bg-white text-sigap-textTertiary disabled:opacity-50 hover:bg-sigap-background transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === "dlq" && (
            <>
              {loading ? (
                <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
                  <p className="text-sigap-textMuted">Memuat...</p>
                </div>
              ) : dlqEntries.length === 0 ? (
                <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
                  <p className="text-sigap-textMuted">Tidak ada entri dead letter.</p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-sigap-border overflow-hidden">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="bg-sigap-background border-b border-sigap-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            ID
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Target
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Retry Count
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Last Error
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Next Retry
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-sigap-textTertiary">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dlqEntries.map((entry) => (
                          <DlqRow
                            key={entry.id}
                            entry={entry}
                            onReset={handleReset}
                            actionLoading={actionLoading}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {dlqTotal > limit && (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setDlqPage((p) => Math.max(1, p - 1))}
                        disabled={dlqPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-sigap-border text-sm bg-white text-sigap-textTertiary disabled:opacity-50 hover:bg-sigap-background transition-colors"
                      >
                        Prev
                      </button>
                      <span className="text-sm text-sigap-textTertiary">
                        Halaman {dlqPage} dari {Math.ceil(dlqTotal / limit)}
                      </span>
                      <button
                        onClick={() => setDlqPage((p) => p + 1)}
                        disabled={dlqPage * limit >= dlqTotal}
                        className="px-3 py-1.5 rounded-lg border border-sigap-border text-sm bg-white text-sigap-textTertiary disabled:opacity-50 hover:bg-sigap-background transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
