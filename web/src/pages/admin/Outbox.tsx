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
    <tr className="border-b border-[#e4e7e2] hover:bg-[#f4f5f3] transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-[#616770]">
          {entry.id.slice(0, 8)}...
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#17191c]">
        {entry.target_system ?? "-"}
      </td>
      <td className="px-4 py-3">
        <StatusPill status={entry.status} />
      </td>
      <td className="px-4 py-3 text-sm text-center text-[#616770]">
        {entry.retry_count}
      </td>
      <td className="px-4 py-3 text-xs text-[#c0392b] max-w-[180px] truncate">
        {entry.error_message ?? "-"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {(entry.status === "failed" || entry.status === "dead_letter") && (
            <button
              onClick={() => onRetry(entry.id)}
              disabled={actionLoading === entry.id}
              className="text-xs px-3 py-1.5 rounded-[8px] bg-[#0f7a6b] text-white font-medium hover:bg-[#0a5c50] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === entry.id ? "..." : "Retry"}
            </button>
          )}
          {!!entry.payload && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#0f7a6b] hover:underline font-medium"
            >
              {expanded ? "Sembunyikan" : "Detail"}
            </button>
          )}
        </div>
        {expanded && !!entry.payload && (
          <div className="mt-2">
            <pre className="text-xs font-mono bg-[#e6e8e3] p-3 rounded-[8px] overflow-x-auto max-w-[400px] text-[#3a3f45]">
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
    <tr className="border-b border-[#e4e7e2] hover:bg-[#f4f5f3] transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-[#616770]">
          {entry.id.slice(0, 8)}...
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#17191c]">
        {entry.target_system ?? "-"}
      </td>
      <td className="px-4 py-3 text-sm text-center text-[#616770]">
        {entry.retry_count}
      </td>
      <td className="px-4 py-3 text-xs text-[#c0392b] max-w-[180px] truncate">
        {entry.last_error ?? "-"}
      </td>
      <td className="px-4 py-3 text-xs text-[#616770]">
        {entry.next_retry_at
          ? new Date(entry.next_retry_at).toLocaleString("id-ID")
          : "-"}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onReset(entry.id)}
          disabled={actionLoading === entry.id}
          className="text-xs px-3 py-1.5 rounded-[8px] border border-[#e4e7e2] bg-white text-[#17191c] font-medium hover:bg-[#f4f5f3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading === entry.id ? "..." : "Reset"}
        </button>
      </td>
    </tr>
  );
};

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
    <div className="min-h-screen bg-[#e6e8e3]">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#17191c] tracking-tight">
            Outbox
          </h1>
          <p className="text-sm text-[#616770] mt-1">
            Kelola event keluar dan dead letter queue
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#b8730a] rounded-[12px] p-4">
            <div className="text-2xl font-bold text-[#8a5808]">{pending}</div>
            <div className="text-xs text-[#616770] mt-1">Pending</div>
          </div>
          <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#c0392b] rounded-[12px] p-4">
            <div className="text-2xl font-bold text-[#a5271a]">{failed}</div>
            <div className="text-xs text-[#616770] mt-1">Failed</div>
          </div>
          <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#0f7a6b] rounded-[12px] p-4">
            <div className="text-2xl font-bold text-[#0a5c50]">{success}</div>
            <div className="text-xs text-[#616770] mt-1">Success</div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 border-b border-[#e4e7e2]">
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
                    ? "text-[#0f7a6b] border-b-2 border-[#0f7a6b]"
                    : "text-[#8a9099] hover:text-[#616770]"
                }`}
              >
                {tab.label}
                {tab.key === "dlq" && failed > 0 && (
                  <span className="ml-1.5 bg-[#c0392b] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {failed}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={handleReconcile}
            disabled={reconcileLoading}
            className="text-sm font-medium px-4 py-2 rounded-[8px] bg-[#0f7a6b] text-white hover:bg-[#0a5c50] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reconcileLoading ? "Memproses..." : "Reconcile"}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-[12px] bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === "events" && (
          <>
            {loading ? (
              <div className="bg-white rounded-[12px] border border-[#e4e7e2] p-8 text-center">
                <p className="text-[#8a9099]">Memuat...</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-white rounded-[12px] border border-[#e4e7e2] p-8 text-center">
                <p className="text-[#8a9099]">Tidak ada event.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-[12px] border border-[#e4e7e2] overflow-hidden">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="bg-[#f4f5f3] border-b border-[#e4e7e2]">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          ID
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          Target
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          Status
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-[#616770]">
                          Attempts
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          Last Error
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
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
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-[8px] border border-[#e4e7e2] text-sm bg-white disabled:opacity-50 hover:bg-[#f4f5f3] transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-[#616770]">
                      Halaman {currentPage} dari {Math.ceil(currentTotal / limit)}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage * limit >= currentTotal}
                      className="px-3 py-1.5 rounded-[8px] border border-[#e4e7e2] text-sm bg-white disabled:opacity-50 hover:bg-[#f4f5f3] transition-colors"
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
              <div className="bg-white rounded-[12px] border border-[#e4e7e2] p-8 text-center">
                <p className="text-[#8a9099]">Memuat...</p>
              </div>
            ) : dlqEntries.length === 0 ? (
              <div className="bg-white rounded-[12px] border border-[#e4e7e2] p-8 text-center">
                <p className="text-[#8a9099]">Tidak ada entri dead letter.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-[12px] border border-[#e4e7e2] overflow-hidden">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="bg-[#f4f5f3] border-b border-[#e4e7e2]">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          ID
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          Target
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-[#616770]">
                          Retry Count
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          Last Error
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
                          Next Retry
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#616770]">
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
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setDlqPage((p) => Math.max(1, p - 1))}
                      disabled={dlqPage === 1}
                      className="px-3 py-1.5 rounded-[8px] border border-[#e4e7e2] text-sm bg-white disabled:opacity-50 hover:bg-[#f4f5f3] transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-[#616770]">
                      Halaman {dlqPage} dari {Math.ceil(dlqTotal / limit)}
                    </span>
                    <button
                      onClick={() => setDlqPage((p) => p + 1)}
                      disabled={dlqPage * limit >= dlqTotal}
                      className="px-3 py-1.5 rounded-[8px] border border-[#e4e7e2] text-sm bg-white disabled:opacity-50 hover:bg-[#f4f5f3] transition-colors"
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
  );
};
