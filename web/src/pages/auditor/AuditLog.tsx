import { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client";
import type { AuditLogEntry } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

interface AuditFilters {
  actor: string;
  action: string;
  from: string;
  to: string;
  wilayah: string;
  objectId: string;
}

interface DiffChange {
  path: string;
  before: unknown;
  after: unknown;
}

function computeDiff(before: unknown, after: unknown, path = ""): DiffChange[] {
  const changes: DiffChange[] = [];
  if (before === after) return changes;
  if (typeof before !== typeof after) {
    changes.push({ path: path || "(root)", before, after });
    return changes;
  }
  if (typeof before !== "object" || before === null || after === null) {
    changes.push({ path: path || "(root)", before, after });
    return changes;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLen = Math.max(before.length, after.length);
    for (let i = 0; i < maxLen; i++) {
      changes.push(...computeDiff(before[i], after[i], `${path}[${i}]`));
    }
    return changes;
  }
  const beforeObj = before as Record<string, unknown>;
  const afterObj = after as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    if (!(key in beforeObj)) {
      changes.push({ path: newPath, before: undefined, after: afterObj[key] });
    } else if (!(key in afterObj)) {
      changes.push({ path: newPath, before: beforeObj[key], after: undefined });
    } else {
      changes.push(...computeDiff(beforeObj[key], afterObj[key], newPath));
    }
  }
  return changes;
}

const SideBySideDiff = ({ before, after }: { before: unknown; after: unknown }) => {
  const changes = computeDiff(before, after);
  if (changes.length === 0 && JSON.stringify(before) === JSON.stringify(after)) {
    return (
      <div className="text-sm text-sigap-textMuted italic">Tidak ada perubahan</div>
    );
  }
  return (
    <div className="space-y-2">
      {changes.map((change, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2 bg-red-50 border border-red-200 rounded overflow-x-auto">
            <span className="text-red-600 font-semibold">- {change.path}: </span>
            <span className="text-red-700">{change.before === undefined ? "(hapus)" : JSON.stringify(change.before)}</span>
          </div>
          <div className="p-2 bg-green-50 border border-green-200 rounded overflow-x-auto">
            <span className="text-green-600 font-semibold">+ {change.path}: </span>
            <span className="text-green-700">{change.after === undefined ? "(hapus)" : JSON.stringify(change.after)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

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

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface EntryRowProps {
  entry: AuditLogEntry;
  onSelect: (entry: AuditLogEntry) => void;
  isSelected: boolean;
}

const EntryRow = ({ entry, onSelect, isSelected }: EntryRowProps) => {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-sigap-border hover:bg-sigap-background cursor-pointer ${isSelected ? "bg-sigap-primary/10" : ""}`}
        onClick={() => onSelect(entry)}
      >
        <td className="px-3 py-2 text-xs text-sigap-textMuted whitespace-nowrap">
          {new Date(entry.created_at).toLocaleString("id-ID")}
        </td>
        <td className="px-3 py-2 text-sm font-mono">{entry.actor ?? "-"}</td>
        <td className="px-3 py-2 text-sm font-medium">{entry.action}</td>
        <td className="px-3 py-2 text-sm">{entry.object_type}</td>
        <td className="px-3 py-2 text-sm font-mono text-xs">{entry.object_id ?? "-"}</td>
        <td className="px-3 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowDiff(!showDiff); }}
            className="text-xs text-sigap-primary hover:underline"
          >
            {showDiff ? "Sembunyikan" : "Diff"}
          </button>
        </td>
      </tr>
      {showDiff && (
        <tr>
          <td colSpan={6} className="px-3 py-3 bg-sigap-surface border-b border-sigap-border">
            <div className="mb-2">
              <span className="text-xs font-semibold text-sigap-textSecondary">Sebelum:</span>
              <div className="mt-1">
                <JsonView data={entry.before} />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-sigap-textSecondary">Sesudah:</span>
              <div className="mt-1">
                <JsonView data={entry.after} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xs font-semibold text-sigap-textSecondary mb-2 block">Diff:</span>
              <SideBySideDiff before={entry.before} after={entry.after} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

interface SelectOption {
  value: string;
  label: string;
}

export const AuditLog = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [filters, setFilters] = useState<AuditFilters>({
    actor: "",
    action: "",
    from: "",
    to: "",
    wilayah: "",
    objectId: "",
  });
  const [actorOptions, setActorOptions] = useState<SelectOption[]>([]);
  const [actionOptions, setActionOptions] = useState<SelectOption[]>([]);
  const [wilayahOptions, setWilayahOptions] = useState<SelectOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const user = useAuthStore((s) => s.user);

  const fetchWilayahOptions = useCallback(async () => {
    try {
      const result = await api.wilayah();
      const flattenWilayah = (nodes: typeof result.wilayah, level = 0): SelectOption[] => {
        const options: SelectOption[] = [];
        for (const node of nodes) {
          options.push({ value: node.id, label: "  ".repeat(level) + node.name });
          if (node.children && node.children.length > 0) {
            options.push(...flattenWilayah(node.children, level + 1));
          }
        }
        return options;
      };
      setWilayahOptions(flattenWilayah(result.wilayah));
    } catch (err) {
      logger.error("Failed to fetch wilayah", { error: err });
    }
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const result = await api.auditSearch({ limit: 500 });
      const uniqueActors = [...new Set(result.entries.map((e) => e.actor).filter(Boolean) as string[])];
      const uniqueActions = [...new Set(result.entries.map((e) => e.action))];
      setActorOptions(uniqueActors.map((a) => ({ value: a, label: a })));
      setActionOptions(uniqueActions.map((a) => ({ value: a, label: a })));
    } catch (err) {
      logger.error("Failed to fetch filter options", { error: err });
    }
  }, []);

  useEffect(() => {
    fetchWilayahOptions();
    fetchFilterOptions();
  }, [fetchWilayahOptions, fetchFilterOptions]);

  const fetchAudit = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: {
      page: number;
      limit: number;
      actor_id?: string;
      action?: string;
      from?: string;
      to?: string;
      report_id?: string;
    } = { page, limit };
    if (filters.actor) params.actor_id = filters.actor;
    if (filters.action) params.action = filters.action;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.objectId) params.report_id = filters.objectId;

    api
      .auditSearch(params)
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch((err) => { logger.error("Failed to fetch audit log", { error: err }); setError(err instanceof Error ? err.message : "Gagal memuat audit log"); })
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const handleFilterChange = (key: keyof AuditFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelectedEntry(null);
  };

  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const exportFilters: { actor_id?: string; action?: string; from?: string; to?: string; report_id?: string } = {};
      if (filters.actor) exportFilters.actor_id = filters.actor;
      if (filters.action) exportFilters.action = filters.action;
      if (filters.from) exportFilters.from = filters.from;
      if (filters.to) exportFilters.to = filters.to;
      if (filters.objectId) exportFilters.report_id = filters.objectId;
      const csv = await api.exportAuditCsv(exportFilters);
      downloadBlob("\uFEFF" + csv, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    } catch (err) {
      logger.error("Failed to export audit log", { error: err });
      setError(err instanceof Error ? err.message : "Gagal mengekspor data");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              A
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Audit Log</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auditor"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Dashboard
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
            <h2 className="text-lg font-semibold">Log Aktivitas Sistem</h2>
            <p className="text-sm text-sigap-textMuted">{total} total</p>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-1.5 rounded border border-sigap-border bg-sigap-surface text-sm font-medium hover:bg-sigap-background transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Mengekspor..." : "Export CSV"}
          </button>
        </div>

        <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Actor</label>
              <select
                value={filters.actor}
                onChange={(e) => handleFilterChange("actor", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="">Semua Actor</option>
                {actorOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Action</label>
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange("action", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="">Semua Action</option>
                {actionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Wilayah</label>
              <select
                value={filters.wilayah}
                onChange={(e) => handleFilterChange("wilayah", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="">Semua Wilayah</option>
                {wilayahOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Object ID</label>
              <input
                type="text"
                value={filters.objectId}
                onChange={(e) => handleFilterChange("objectId", e.target.value)}
                placeholder="Filter object ID..."
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
          {(filters.actor || filters.action || filters.from || filters.to || filters.objectId || filters.wilayah) && (
            <button
              onClick={() => setFilters({ actor: "", action: "", from: "", to: "", wilayah: "", objectId: "" })}
              className="text-xs text-sigap-primary hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>

        {selectedEntry && (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Detail: {selectedEntry.action}</h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-xs text-sigap-textMuted hover:text-sigap-textSecondary"
              >
                Tutup
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-medium text-sigap-textMuted">Sebelum:</span>
                <div className="mt-1">
                  <JsonView data={selectedEntry.before} />
                </div>
              </div>
              <div>
                <span className="font-medium text-sigap-textMuted">Sesudah:</span>
                <div className="mt-1">
                  <JsonView data={selectedEntry.after} />
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-sigap-border">
              <span className="text-xs font-semibold text-sigap-textSecondary mb-2 block">Diff:</span>
              <SideBySideDiff before={selectedEntry.before} after={selectedEntry.after} />
            </div>
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
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onSelect={setSelectedEntry}
                      isSelected={selectedEntry?.id === entry.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-surface"
                >
                  Prev
                </button>
                <span className="text-sm text-sigap-textMuted">
                  Halaman {page} dari {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
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
