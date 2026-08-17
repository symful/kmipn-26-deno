import { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client";
import type { AuditLogEntry } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors, sidebarBg, sidebarText, sidebarTextHover, sidebarTextMuted, sidebarDivider, sidebarAccent, bgSoft } from "../../theme/tokens";
import { logger } from "@/lib/logger";

interface AuditFilters {
  actor: string;
  action: string;
  from: string;
  to: string;
  wilayah: string;
  objectId: string;
  status: string;
}

interface SelectOption {
  value: string;
  label: string;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Dashboard", path: "/auditor" },
  { label: "Audit Log", path: "/auditor/audit-log", active: true },
];

const LOGO_INITIAL = "A";

function Sidebar({
  activePath,
  onNavigate,
}: {
  activePath?: string;
  onNavigate?: (path: string) => void;
}) {
  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        height: "100vh",
        backgroundColor: sidebarBg,
        color: sidebarText,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "20px 16px",
          borderBottom: `1px solid ${sidebarDivider}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              backgroundColor: colors.primary,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {LOGO_INITIAL}
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: sidebarText }}>
            PantauDesa
          </span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === activePath;
          return (
            <div
              key={item.path}
              onClick={() => item.path && onNavigate?.(item.path)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                backgroundColor: isActive ? sidebarAccent : "transparent",
                color: isActive ? sidebarTextHover : sidebarText,
                marginBottom: 4,
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                transition: "background-color 150ms ease, color 150ms ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = sidebarDivider;
                  (e.currentTarget as HTMLDivElement).style.color = sidebarTextHover;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLDivElement).style.color = sidebarText;
                }
              }}
            >
              {item.label}
            </div>
          );
        })}
      </nav>

      <div
        style={{
          padding: "12px 8px",
          borderTop: `1px solid ${sidebarDivider}`,
        }}
      >
        <div
          onClick={() => useAuthStore.getState().clear()}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: sidebarTextMuted,
            fontSize: 14,
            transition: "background-color 150ms ease, color 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = sidebarDivider;
            (e.currentTarget as HTMLDivElement).style.color = sidebarText;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLDivElement).style.color = sidebarTextMuted;
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </div>
      </div>
    </aside>
  );
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

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
      <div className="text-sm text-sigap-textTertiary italic">Tidak ada perubahan</div>
    );
  }
  return (
    <div className="space-y-2">
      {changes.slice(0, 20).map((change, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2 bg-red-50 border border-red-200 rounded overflow-x-auto">
            <span className="text-red-600 font-semibold">- {change.path}: </span>
            <span className="text-red-700">
              {change.before === undefined ? "(hapus)" : JSON.stringify(change.before)}
            </span>
          </div>
          <div className="p-2 bg-green-50 border border-green-200 rounded overflow-x-auto">
            <span className="text-green-600 font-semibold">+ {change.path}: </span>
            <span className="text-green-700">
              {change.after === undefined ? "(hapus)" : JSON.stringify(change.after)}
            </span>
          </div>
        </div>
      ))}
      {changes.length > 20 && (
        <p className="text-xs text-sigap-textTertiary">
          ...dan {changes.length - 20} perubahan lainnya
        </p>
      )}
    </div>
  );
};

const JsonView = ({ data }: { data: unknown }) => {
  const [expanded, setExpanded] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);
  const isLong = jsonStr.length > 200;

  if (!isLong) {
    return (
      <pre className="text-xs font-mono bg-sigap-surface p-2 rounded overflow-x-auto">
        {jsonStr}
      </pre>
    );
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
        <pre className="text-xs font-mono bg-sigap-surface p-2 rounded overflow-x-auto mt-1">
          {jsonStr}
        </pre>
      )}
    </div>
  );
};

// ─── Download helper ───────────────────────────────────────────────────────────

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Entry Row ───────────────────────────────────────────────────────────────

const EntryRow = ({
  entry,
  onSelect,
  isSelected,
}: {
  entry: AuditLogEntry;
  onSelect: (entry: AuditLogEntry) => void;
  isSelected: boolean;
}) => {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-sigap-border hover:bg-sigap-surface cursor-pointer transition-colors ${
          isSelected ? "bg-sigap-primary/10" : ""
        }`}
        onClick={() => onSelect(entry)}
        style={{ borderBottomColor: colors.border }}
      >
        <td className="px-3 py-2.5 text-xs text-sigap-textTertiary whitespace-nowrap">
          {new Date(entry.created_at).toLocaleString("id-ID")}
        </td>
        <td className="px-3 py-2.5 text-sm font-mono text-sigap-textPrimary">
          {entry.actor ?? "-"}
        </td>
        <td className="px-3 py-2.5 text-sm font-medium text-sigap-textPrimary">
          {entry.action}
        </td>
        <td className="px-3 py-2.5 text-sm text-sigap-textPrimary">{entry.object_type}</td>
        <td className="px-3 py-2.5 text-sm font-mono text-xs text-sigap-textSecondary">
          {entry.object_id ?? "-"}
        </td>
        <td className="px-3 py-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDiff(!showDiff);
            }}
            className="text-xs text-sigap-primary hover:text-sigap-primaryHover font-medium"
          >
            {showDiff ? "Sembunyikan" : "Detail"}
          </button>
        </td>
      </tr>
      {showDiff && (
        <tr>
          <td
            colSpan={6}
            className="px-3 py-3 bg-sigap-surface border-b border-sigap-border"
            style={{ borderBottomColor: colors.border }}
          >
            <div className="mb-3">
              <span className="text-xs font-semibold text-sigap-textSecondary">Sebelum:</span>
              <div className="mt-1">
                <JsonView data={entry.before} />
              </div>
            </div>
            <div className="mb-3">
              <span className="text-xs font-semibold text-sigap-textSecondary">Sesudah:</span>
              <div className="mt-1">
                <JsonView data={entry.after} />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-sigap-textSecondary mb-2 block">
                Diff:
              </span>
              <SideBySideDiff before={entry.before} after={entry.after} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── Filter Components ────────────────────────────────────────────────────────

const FilterInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-sigap-textSecondary">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 rounded-lg border border-sigap-border bg-white text-sm text-sigap-textPrimary placeholder:text-sigap-textMuted focus:outline-none focus:border-sigap-primary focus:ring-1 focus:ring-sigap-primary transition-colors"
      style={{ borderColor: colors.border }}
    />
  </div>
);

const FilterSelect = ({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-sigap-textSecondary">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg border border-sigap-border bg-white text-sm text-sigap-textPrimary focus:outline-none focus:border-sigap-primary focus:ring-1 focus:ring-sigap-primary transition-colors"
      style={{ borderColor: colors.border }}
    >
      <option value="">{placeholder ?? `Semua ${label}`}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

const STATUS_CHIPS = [
  { value: "", label: "Semua" },
  { value: "create", label: "Buat" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Hapus" },
  { value: "verify", label: "Verifikasi" },
  { value: "assign", label: "Tugaskan" },
  { value: "reject", label: "Tolak" },
  { value: "resolve", label: "Selesaikan" },
];

const ChipFilter = ({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-2 flex-wrap">
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          value === opt.value
            ? "bg-sigap-primary text-white"
            : "bg-sigap-surface text-sigap-textSecondary hover:bg-sigap-border"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ─── Pagination ───────────────────────────────────────────────────────────────

const Pagination = ({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) => {
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-t border-sigap-border"
      style={{ borderTopColor: colors.border }}
    >
      <div className="text-sm text-sigap-textTertiary">
        Halaman {page} dari {totalPages}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm font-medium text-sigap-textSecondary border border-sigap-border rounded hover:bg-sigap-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ borderColor: colors.border }}
        >
          Prev
        </button>
        {getPageNumbers().map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-sm text-sigap-textTertiary">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p as number)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                p === page
                  ? "bg-sigap-primary text-white"
                  : "text-sigap-textSecondary hover:bg-sigap-surface"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-sm font-medium text-sigap-textSecondary border border-sigap-border rounded hover:bg-sigap-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ borderColor: colors.border }}
        >
          Next
        </button>
      </div>
    </div>
  );
};

// ─── Export Button ────────────────────────────────────────────────────────────

const ExportButton = ({
  onClick,
  disabled,
  label = "Export CSV",
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg border border-sigap-border text-sigap-textSecondary text-sm font-medium hover:bg-sigap-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    style={{ borderColor: colors.border }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    {label}
  </button>
);

// ─── Main Component ────────────────────────────────────────────────────────────

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
    status: "",
  });
  const [actorOptions, setActorOptions] = useState<SelectOption[]>([]);
  const [actionOptions, setActionOptions] = useState<SelectOption[]>([]);
  const [wilayahOptions, setWilayahOptions] = useState<SelectOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const user = useAuthStore((s) => s.user);

  const fetchWilayahOptions = useCallback(async () => {
    try {
      const result = await api.wilayah();
      const flattenWilayah = (
        nodes: typeof result.wilayah,
        level = 0
      ): SelectOption[] => {
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
      const uniqueActors = [
        ...new Set(
          result.entries.map((e) => e.actor).filter(Boolean) as string[]
        ),
      ];
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
      .catch((err) => {
        logger.error("Failed to fetch audit log", { error: err });
        setError(err instanceof Error ? err.message : "Gagal memuat audit log");
      })
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

  const handleStatusFilter = (status: string) => {
    setFilters((f) => ({ ...f, action: status }));
    setPage(1);
    setSelectedEntry(null);
  };

  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const exportFilters: {
        actor_id?: string;
        action?: string;
        from?: string;
        to?: string;
        report_id?: string;
      } = {};
      if (filters.actor) exportFilters.actor_id = filters.actor;
      if (filters.action) exportFilters.action = filters.action;
      if (filters.from) exportFilters.from = filters.from;
      if (filters.to) exportFilters.to = filters.to;
      if (filters.objectId) exportFilters.report_id = filters.objectId;
      const csv = await api.exportAuditCsv(exportFilters);
      downloadBlob(
        "\uFEFF" + csv,
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
        "text/csv;charset=utf-8"
      );
    } catch (err) {
      logger.error("Failed to export audit log", { error: err });
      setError(err instanceof Error ? err.message : "Gagal mengekspor data");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters =
    filters.actor ||
    filters.action ||
    filters.from ||
    filters.to ||
    filters.objectId ||
    filters.wilayah ||
    filters.status;

  // Filter entries client-side by search query
  const filteredEntries = searchQuery
    ? entries.filter(
        (e) =>
          (e.actor?.toLowerCase() ?? "").includes(searchQuery.toLowerCase()) ||
          e.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (e.object_type?.toLowerCase() ?? "").includes(searchQuery.toLowerCase()) ||
          (e.object_id?.toLowerCase() ?? "").includes(searchQuery.toLowerCase())
      )
    : entries;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* W-02 Dark Sidebar */}
      <Sidebar activePath="/auditor/audit-log" />

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header
          style={{
            height: 58,
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            backgroundColor: "white",
            gap: 16,
          }}
        >
          <div className="flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari actor, action, object..."
              className="w-full px-3 py-1.5 rounded-lg border border-sigap-border bg-sigap-surface text-sm text-sigap-textPrimary placeholder:text-sigap-textMuted focus:outline-none focus:border-sigap-primary focus:ring-1 focus:ring-sigap-primary transition-colors"
              style={{
                borderColor: colors.border,
                backgroundColor: bgSoft,
              }}
            />
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-sigap-textMuted">
              {user?.name ?? ""} ({user?.role ?? ""})
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: colors.primary,
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {(user?.name ?? "A").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main
          style={{
            flex: 1,
            padding: 24,
            backgroundColor: bgSoft,
            maxWidth: 1400,
          }}
        >
          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2
                className="text-lg font-semibold text-sigap-textPrimary"
                style={{ letterSpacing: "-0.01em" }}
              >
                Log Aktivitas Sistem
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-sigap-surface text-xs text-sigap-textTertiary">
                {total.toLocaleString()} total
              </span>
            </div>
            <ExportButton
              onClick={handleExportCsv}
              disabled={exporting}
              label={exporting ? "Mengekspor..." : "Export CSV"}
            />
          </div>

          {/* Status filter chips */}
          <div className="bg-white rounded-lg border border-sigap-border p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-sigap-textSecondary">Action:</span>
            </div>
            <ChipFilter
              options={STATUS_CHIPS}
              value={filters.action}
              onChange={handleStatusFilter}
            />
          </div>

          {/* Advanced filters */}
          <div
            className="bg-white rounded-lg border border-sigap-border p-4 mb-4"
            style={{ borderColor: colors.border }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <FilterSelect
                label="Actor"
                value={filters.actor}
                onChange={(v) => handleFilterChange("actor", v)}
                options={actorOptions}
                placeholder="Semua Actor"
              />
              <FilterSelect
                label="Action"
                value={filters.action}
                onChange={(v) => handleFilterChange("action", v)}
                options={actionOptions}
                placeholder="Semua Action"
              />
              <FilterSelect
                label="Wilayah"
                value={filters.wilayah}
                onChange={(v) => handleFilterChange("wilayah", v)}
                options={wilayahOptions}
                placeholder="Semua Wilayah"
              />
              <FilterInput
                label="Object ID"
                value={filters.objectId}
                onChange={(v) => handleFilterChange("objectId", v)}
                placeholder="Filter object ID..."
              />
              <FilterInput
                label="Dari Tanggal"
                value={filters.from}
                onChange={(v) => handleFilterChange("from", v)}
                type="date"
              />
              <FilterInput
                label="Sampai Tanggal"
                value={filters.to}
                onChange={(v) => handleFilterChange("to", v)}
                type="date"
              />
            </div>
            {hasActiveFilters && (
              <div
                className="mt-3 pt-3 border-t border-sigap-border"
                style={{ borderTopColor: colors.border }}
              >
                <button
                  onClick={() =>
                    setFilters({
                      actor: "",
                      action: "",
                      from: "",
                      to: "",
                      wilayah: "",
                      objectId: "",
                      status: "",
                    })
                  }
                  className="text-xs text-sigap-primary hover:text-sigap-primaryHover font-medium"
                >
                  Reset Filter
                </button>
              </div>
            )}
          </div>

          {/* Selected entry detail */}
          {selectedEntry && (
            <div
              className="bg-white rounded-lg border border-sigap-border p-4 mb-4"
              style={{ borderColor: colors.border }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-sigap-textPrimary">
                  Detail: {selectedEntry.action}
                </h3>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-xs text-sigap-textTertiary hover:text-sigap-textSecondary"
                >
                  Tutup
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-medium text-sigap-textSecondary">Sebelum:</span>
                  <div className="mt-1">
                    <JsonView data={selectedEntry.before} />
                  </div>
                </div>
                <div>
                  <span className="font-medium text-sigap-textSecondary">Sesudah:</span>
                  <div className="mt-1">
                    <JsonView data={selectedEntry.after} />
                  </div>
                </div>
              </div>
              <div
                className="mt-3 pt-3 border-t border-sigap-border"
                style={{ borderTopColor: colors.border }}
              >
                <span className="text-xs font-semibold text-sigap-textSecondary mb-2 block">
                  Diff:
                </span>
                <SideBySideDiff before={selectedEntry.before} after={selectedEntry.after} />
              </div>
            </div>
          )}

          {/* Data table */}
          {loading ? (
            <div
              className="bg-white rounded-lg border border-sigap-border overflow-hidden"
              style={{ borderColor: colors.border }}
            >
              <div className="p-8 text-center">
                <div
                  className="inline-block w-6 h-6 border-2 border-sigap-primary border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: colors.primary, borderTopColor: "transparent" }}
                />
                <p className="mt-3 text-sm text-sigap-textTertiary">Memuat...</p>
              </div>
            </div>
          ) : error ? (
            <div
              className="bg-white rounded-lg border border-sigap-border p-4"
              style={{ borderColor: colors.border }}
            >
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div
              className="bg-white rounded-lg border border-sigap-border overflow-hidden"
              style={{ borderColor: colors.border }}
            >
              <div className="p-8 text-center">
                <p className="text-sigap-textSecondary">Tidak ada entri audit.</p>
              </div>
            </div>
          ) : (
            <div
              className="bg-white rounded-lg border border-sigap-border overflow-hidden"
              style={{ borderColor: colors.border }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr
                      className="border-b border-sigap-border"
                      style={{ borderBottomColor: colors.border }}
                    >
                      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                        Timestamp
                      </th>
                      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                        Actor
                      </th>
                      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                        Action
                      </th>
                      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                        Object Type
                      </th>
                      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                        Object ID
                      </th>
                      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                        Detail
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
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
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
