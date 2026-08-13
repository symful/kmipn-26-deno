import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
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

type Tab = "pending" | "sent" | "retry" | "dead_letter";

const STATUS_LABELS: Record<string, string> = {
  pending: "Tertunda",
  sent: "Terkirim",
  failed: "Gagal",
  dead_letter: "Dead Letter",
  skipped: "Dilewati",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#2563eb",
  sent: "#0f7a6b",
  failed: "#c0392b",
  dead_letter: "#7c3aed",
  skipped: "#8a9099",
};

interface OutboxRowProps {
  entry: OutboxEntry;
  onRetry: (id: string) => void;
  showRetry?: boolean;
}

const OutboxRow = ({ entry, onRetry, showRetry = true }: OutboxRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const payloadSummary = entry.payload
    ? JSON.stringify(entry.payload).slice(0, 80) + (JSON.stringify(entry.payload).length > 80 ? "..." : "")
    : "-";

  return (
    <tr className="border-b border-sigap-border hover:bg-sigap-background">
      <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
        {new Date(entry.created_at).toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-2 text-sm font-medium">{entry.target_system ?? "-"}</td>
      <td className="px-3 py-2 text-sm max-w-[200px]">
        <span className="font-mono text-xs">{payloadSummary}</span>
      </td>
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: STATUS_COLORS[entry.status] + "20", color: STATUS_COLORS[entry.status] }}
        >
          {STATUS_LABELS[entry.status] ?? entry.status}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-center">{entry.retry_count}</td>
      <td className="px-3 py-2 text-xs text-red-600 max-w-[150px] truncate">
        {entry.error_message ?? "-"}
      </td>
      <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
        {entry.last_attempt_at ? new Date(entry.last_attempt_at).toLocaleString("id-ID") : "-"}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {showRetry && (entry.status === "failed" || entry.status === "dead_letter") && (
            <button
              onClick={() => onRetry(entry.id)}
              className="text-xs px-2 py-1 rounded border border-sigap-border hover:bg-sigap-surface transition-colors"
            >
              Coba Lagi
            </button>
          )}
          {!!entry.payload && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-sigap-primary hover:underline"
            >
              {expanded ? "Sembunyikan" : "Detail"}
            </button>
          )}
        </div>
        {expanded && !!entry.payload && (
          <div className="mt-2">
            <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto max-w-[400px]">
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
  onRetry: (id: string) => void;
  onReset: (id: string) => void;
  canRetry: boolean;
}

const DlqRow = ({ entry, onRetry, onReset, canRetry }: DlqRowProps) => {
  return (
    <tr className="border-b border-sigap-border hover:bg-sigap-background">
      <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
        {new Date(entry.created_at).toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-2 text-sm font-medium">{entry.target_system ?? "-"}</td>
      <td className="px-3 py-2 text-sm">{entry.related_report_id ?? "-"}</td>
      <td className="px-3 py-2 text-sm text-center">{entry.retry_count}</td>
      <td className="px-3 py-2 text-xs text-red-600 max-w-[150px] truncate">
        {entry.last_error ?? "-"}
      </td>
      <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
        {entry.next_retry_at ? new Date(entry.next_retry_at).toLocaleString("id-ID") : "-"}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {canRetry && (
            <button
              onClick={() => onRetry(entry.id)}
              className="text-xs px-2 py-1 rounded border border-sigap-border hover:bg-sigap-surface transition-colors"
            >
              Coba Lagi
            </button>
          )}
          <button
            onClick={() => onReset(entry.id)}
            className="text-xs px-2 py-1 rounded border border-sigap-border hover:bg-sigap-surface transition-colors"
          >
            Reset
          </button>
        </div>
      </td>
    </tr>
  );
};

type AlertInfo = {
  type: "warning" | "error";
  message: string;
} | null;

export const AdminOutbox = () => {
  const [activeTab, setActiveTab] = useState<Tab>("pending");
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
  const [filters, setFilters] = useState({ target_system: "", from: "", to: "" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [alert, setAlert] = useState<AlertInfo>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [forceRetryLoading, setForceRetryLoading] = useState(false);
  const user = useAuthStore((s) => s.user);

  const isAdmin = user?.role === "ADMIN";
  const isAdminDaerah = user?.role === "ADMIN_DAERAH";
  const canRetryDlq = isAdmin || isAdminDaerah;

  const fetchStats = () => {
    api.outboxStats().then((data) => {
      setStats(data.stats);
      setAlert(checkForAlerts(data.stats));
    }).catch((e) => { logger.error("Failed to fetch outbox stats", { error: e }); setStats(null); });
  };

  const checkForAlerts = (statsData: OutboxStats): AlertInfo => {
    let hasSkipped = false;
    let hasUnconfigured = false;

    for (const [system, statusMap] of Object.entries(statsData)) {
      if (statusMap["skipped"] && statusMap["skipped"] > 0) {
        hasSkipped = true;
      }
      if (system === "" || system === "unknown" || system === "unconfigured") {
        const totalForSystem = Object.values(statusMap).reduce((sum, count) => sum + count, 0);
        if (totalForSystem > 0) {
          hasUnconfigured = true;
        }
      }
    }

    if (hasSkipped && hasUnconfigured) {
      return { type: "warning", message: "Ada item yang dilewati dan beberapa target system belum dikonfigurasi. Silakan periksa daftar dead letter." };
    } else if (hasSkipped) {
      return { type: "warning", message: "Ada item yang dilewati. Silakan periksa daftar dead letter untuk detail." };
    } else if (hasUnconfigured) {
      return { type: "error", message: "Beberapa target system belum dikonfigurasi. Pesan tidak dapat dikirim." };
    }
    return null;
  };

  const fetchEntries = () => {
    setLoading(true);
    setError(null);
    const params: { status: string; target_system?: string; page: number; limit: number; from?: string; to?: string } = {
      status: activeTab === "retry" ? "failed" : activeTab,
      page,
      limit,
    };
    if (filters.target_system) params.target_system = filters.target_system;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;

    api
      .outboxList(params)
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch((e) => { logger.error("Failed to fetch outbox entries", { error: e }); setError("Gagal memuat data outbox"); })
      .finally(() => setLoading(false));
  };

  const fetchDlq = () => {
    setLoading(true);
    setError(null);
    const params: { page: number; limit: number; target_system?: string; from?: string; to?: string } = {
      page: dlqPage,
      limit,
    };
    if (filters.target_system) params.target_system = filters.target_system;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;

    api
      .outboxDlq(params)
      .then((data) => {
        setDlqEntries(data.items);
        setDlqTotal(data.total);
      })
      .catch((e) => { logger.error("Failed to fetch dead letter queue", { error: e }); setError("Gagal memuat data dead letter"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === "dead_letter") {
      fetchDlq();
    } else {
      fetchEntries();
    }
  }, [activeTab, page, dlqPage, filters.target_system, filters.from, filters.to]);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      await api.outboxRetry(id);
      if (activeTab === "dead_letter") {
        fetchDlq();
      } else {
        fetchEntries();
      }
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
      if (activeTab === "dead_letter") {
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

  const handleForceRetryAll = async () => {
    if (!window.confirm("Yakin ingin memaksa ulang semua entri stuck (pending >24 jam atau failed yang sudah lewat waktu retry)?")) return;
    setForceRetryLoading(true);
    try {
      await api.outboxReconcile();
      fetchStats();
      if (activeTab === "dead_letter") {
        fetchDlq();
      } else {
        fetchEntries();
      }
      setAlert({ type: "warning", message: "Berhasil memaksa ulang entri stuck." });
    } catch (e) {
      logger.error("Failed to force retry all", { error: e });
      setError(e instanceof Error ? e.message : "Gagal menjalankan paksa ulang");
    } finally {
      setForceRetryLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setDlqPage(1);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "Tertunda" },
    { key: "sent", label: "Terkirim" },
    { key: "retry", label: "Coba Lagi" },
    { key: "dead_letter", label: "Dead Letter" },
  ];

  const currentPage = activeTab === "dead_letter" ? dlqPage : page;
  const currentTotal = activeTab === "dead_letter" ? dlqTotal : total;
  const setCurrentPage = activeTab === "dead_letter" ? setDlqPage : setPage;

  const statCards = stats
    ? Object.entries(stats).map(([system, statusMap]) => (
        <div key={system} className="bg-sigap-surface rounded-lg p-3 border border-sigap-border">
          <p className="text-xs font-medium text-sigap-textMuted mb-1">{system || "(tanpa sistem target)"}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusMap).map(([status, count]) => (
              <span key={status} className="text-xs">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status] }}
                >
                  {STATUS_LABELS[status] ?? status}: {count}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))
    : null;

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
              to="/admin"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Beranda
            </Link>
            <button
              onClick={() => useAuthStore.getState().clear()}
              className="text-sm text-sigap-perluTindakan hover:underline"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Outbox Monitoring</h2>
            <p className="text-sm text-sigap-textMuted">
              {activeTab === "dead_letter" ? `${dlqTotal} total` : `${total} total`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReconcile}
              disabled={reconcileLoading}
              className="text-sm font-medium px-3 py-1.5 rounded border border-sigap-border bg-sigap-surface hover:bg-sigap-border transition-colors disabled:opacity-50"
            >
              {reconcileLoading ? "Memproses..." : "Rekonsiliasi"}
            </button>
            {canRetryDlq && (
              <button
                onClick={handleForceRetryAll}
                disabled={forceRetryLoading}
                className="text-sm font-medium px-3 py-1.5 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {forceRetryLoading ? "Memproses..." : "Paksa Ulangi Semua Stuck"}
              </button>
            )}
          </div>
        </div>

        {statCards && statCards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {statCards}
          </div>
        )}

        {alert && (
          <div className={`mb-4 p-4 rounded-lg border flex items-center gap-3 ${
            alert.type === "warning"
              ? "bg-yellow-50 border-yellow-200 text-yellow-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            <span className="text-lg">
              {alert.type === "warning" ? "⚠" : "✕"}
            </span>
            <span className="text-sm flex-1">{alert.message}</span>
            <button
              onClick={() => setAlert(null)}
              className="text-xs text-sigap-textMuted hover:text-sigap-textSecondary"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex gap-1 mb-4 border-b border-sigap-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
                setDlqPage(1);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? "text-sigap-primary border-b-2 border-sigap-primary"
                  : "text-sigap-textMuted hover:text-sigap-textPrimary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Target System</label>
              <input
                type="text"
                value={filters.target_system}
                onChange={(e) => handleFilterChange("target_system", e.target.value)}
                placeholder="Filter target system..."
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => handleFilterChange("from", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => handleFilterChange("to", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
        ) : error ? (
          <div className="p-4 rounded bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
            {error}
          </div>
        ) : activeTab === "dead_letter" ? (
          dlqEntries.length === 0 ? (
            <p className="text-center text-sigap-textMuted py-8">Tidak ada entri dead letter.</p>
          ) : (
            <>
              <div className="bg-sigap-surface rounded-lg border border-sigap-border overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-sigap-background border-b border-sigap-border">
                      <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Timestamp</th>
                      <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Target System</th>
                      <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Report ID</th>
                      <th className="text-center px-3 py-2 font-medium text-sigap-textMuted">Retry</th>
                      <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Last Error</th>
                      <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Next Retry</th>
                      <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlqEntries.map((entry) => (
                      <DlqRow
                        key={entry.id}
                        entry={entry}
                        onRetry={handleRetry}
                        onReset={handleReset}
                        canRetry={canRetryDlq}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {dlqTotal > limit && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setDlqPage((p) => Math.max(1, p - 1))}
                    disabled={dlqPage === 1}
                    className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                  >
                    Prev
                  </button>
                  <span className="text-sm text-sigap-textMuted">
                    Halaman {dlqPage} dari {Math.ceil(dlqTotal / limit)}
                  </span>
                  <button
                    onClick={() => setDlqPage((p) => p + 1)}
                    disabled={dlqPage * limit >= dlqTotal}
                    className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )
        ) : entries.length === 0 ? (
          <p className="text-center text-sigap-textMuted py-8">Tidak ada entri outbox.</p>
        ) : (
          <>
            <div className="bg-sigap-surface rounded-lg border border-sigap-border overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="bg-sigap-background border-b border-sigap-border">
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Timestamp</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Target System</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Payload</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Status</th>
                    <th className="text-center px-3 py-2 font-medium text-sigap-textMuted">Retry</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Last Error</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Last Attempt</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <OutboxRow
                      key={entry.id}
                      entry={entry}
                      onRetry={handleRetry}
                      showRetry={activeTab === "retry" || activeTab === "pending"}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {total > limit && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                >
                  Prev
                </button>
                <span className="text-sm text-sigap-textMuted">
                  Halaman {page} dari {Math.ceil(total / limit)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * limit >= total}
                  className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
