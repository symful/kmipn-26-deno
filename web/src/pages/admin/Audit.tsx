import { useEffect, useState, useRef } from "react";
import { api } from "../../api/client";
import type { AuditLogEntry } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

const JsonView = ({ data }: { data: unknown }) => {
  const [expanded, setExpanded] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);
  const isLong = jsonStr.length > 200;

  if (!isLong) {
    return <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto">{jsonStr}</pre>;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-sigap-primary hover:underline"
      >
        {expanded ? "Sembunyikan" : "Lihat"} JSON
      </button>
      {expanded && (
        <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto mt-1">{jsonStr}</pre>
      )}
    </div>
  );
};

const ExportDropdown = ({
  filters,
  onExport,
}: {
  filters: { action: string; actor_id: string; from: string; to: string };
  onExport: (kind: "csv" | "json" | "integrity") => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-1.5 rounded border border-sigap-border bg-sigap-surface text-sm font-medium hover:bg-sigap-background transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-sigap-surface border border-sigap-border rounded shadow-lg z-10">
          <button
            onClick={() => { onExport("csv"); setOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-sigap-background transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => { onExport("json"); setOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-sigap-background transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={() => { onExport("integrity"); setOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-sigap-background transition-colors"
          >
            Integrity Report
          </button>
        </div>
      )}
    </div>
  );
};

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportIntegrityReport(onError: (msg: string) => void, onSuccess: (result: { valid: boolean; entries_checked: number }) => void) {
  try {
    const result = await api.auditVerifyChain();
    downloadBlob(JSON.stringify(result, null, 2), "audit-integrity.json", "application/json");
    onSuccess({ valid: result.ok, entries_checked: result.count });
  } catch {
    onError("Gagal mengunduh laporan integritas");
  }
}

interface EntryRowProps {
  entry: AuditLogEntry;
}

const EntryRow = ({ entry }: EntryRowProps) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <tr className="border-b border-sigap-border hover:bg-sigap-background">
      <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
        {new Date(entry.created_at).toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-2 text-sm font-mono">{entry.actor ?? "-"}</td>
      <td className="px-3 py-2 text-sm font-medium">{entry.action}</td>
      <td className="px-3 py-2 text-sm">{entry.object_type}</td>
      <td className="px-3 py-2 text-sm font-mono text-xs">{entry.object_id ?? "-"}</td>
      <td className="px-3 py-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-sigap-primary hover:underline"
        >
          {showDetails ? "Sembunyikan" : "Detail"}
        </button>
        {showDetails && (
          <div className="mt-2 space-y-2">
            <div>
              <span className="text-xs font-medium text-sigap-textMuted">Before:</span>
              <JsonView data={entry.before} />
            </div>
            <div>
              <span className="text-xs font-medium text-sigap-textMuted">After:</span>
              <JsonView data={entry.after} />
            </div>
          </div>
        )}
      </td>
    </tr>
  );
};

export const AdminAudit = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [filters, setFilters] = useState({ action: "", actor_id: "", from: "", to: "" });
  const [exporting, setExporting] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; entries_checked: number } | null>(null);
  const user = useAuthStore((s) => s.user);

  const fetchAudit = () => {
    setLoading(true);
    setError(null);
    const params: {
      page: number;
      limit: number;
      action?: string;
      actor_id?: string;
      from?: string;
      to?: string;
    } = { page, limit };
    if (filters.action) params.action = filters.action;
    if (filters.actor_id) params.actor_id = filters.actor_id;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;

    api
      .auditSearch(params)
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch((e) => { logger.error("Failed to fetch audit log", { error: e }); setError("Gagal memuat audit log"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAudit();
  }, [page, filters.action, filters.actor_id, filters.from, filters.to]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const handleExport = async (kind: "csv" | "json" | "integrity") => {
    if (exporting) return;
    setExporting(true);
    try {
      if (kind === "integrity") {
        await exportIntegrityReport((msg) => setError(msg), (result) => setVerifyResult(result));
      } else {
        const exportFilters: { action?: string; actor_id?: string; from?: string; to?: string } = {};
        if (filters.action) exportFilters.action = filters.action;
        if (filters.actor_id) exportFilters.actor_id = filters.actor_id;
        if (filters.from) exportFilters.from = filters.from;
        if (filters.to) exportFilters.to = filters.to;
        if (kind === "csv") {
          const csv = await api.exportAuditCsv(exportFilters);
          downloadBlob("\uFEFF" + csv, `audit-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
        } else {
          const json = await api.exportAuditJson(exportFilters);
          downloadBlob(json, `audit-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
        }
      }
    } catch {
      setError("Gagal mengekspor data");
    } finally {
      setExporting(false);
    }
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
            <h2 className="text-lg font-semibold">Audit Log</h2>
            <p className="text-sm text-sigap-textMuted">{total} total</p>
          </div>
          <ExportDropdown filters={filters} onExport={handleExport} />
        </div>

        <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Action</label>
              <input
                type="text"
                value={filters.action}
                onChange={(e) => handleFilterChange("action", e.target.value)}
                placeholder="Filter action..."
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Actor ID</label>
              <input
                type="text"
                value={filters.actor_id}
                onChange={(e) => handleFilterChange("actor_id", e.target.value)}
                placeholder="Filter actor..."
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

        {verifyResult && (
          <div className={`mb-4 p-4 rounded-lg border flex items-center gap-3 ${
            verifyResult.valid
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}>
            <span className={`text-lg font-bold ${
              verifyResult.valid ? "text-green-600" : "text-red-600"
            }`}>
              {verifyResult.valid ? "✓ CHAIN VERIFIED" : "✗ CHAIN INVALID"}
            </span>
            <span className="text-sm text-sigap-textSecondary">
              {verifyResult.entries_checked} entri dicek
            </span>
            <button
              onClick={() => setVerifyResult(null)}
              className="ml-auto text-xs text-sigap-textMuted hover:text-sigap-textSecondary"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
        ) : error ? (
          <div className="p-4 rounded bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-sigap-textMuted py-8">
            Tidak ada entri audit.
          </p>
        ) : (
          <>
            <div className="bg-sigap-surface rounded-lg border border-sigap-border overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-sigap-background border-b border-sigap-border">
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Timestamp</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Actor</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Action</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Object Type</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Object ID</th>
                    <th className="text-left px-3 py-2 font-medium text-sigap-textMuted">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
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
