import { colors } from "../../theme/tokens";

export type VerificationStatus = "menunggu" | "perlu_tindakan" | "diterima" | "ditolak";

export interface VerificationQueueItem {
  id: string;
  shortCode: string;
  categoryIcon: string | null;
  categoryName: string;
  villageName: string;
  districtName: string;
  createdAt: string;
  status: VerificationStatus;
}

export interface VerificationQueuePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface VerificationQueueData {
  items: VerificationQueueItem[];
  pagination: VerificationQueuePagination;
}

export interface VerificationQueueProps {
  data: VerificationQueueData;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onPageChange?: (page: number) => void;
  onViewDetails?: (id: string) => void;
  onTakeAction?: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

const STATUS_COLORS: Record<VerificationStatus, { bg: string; text: string; label: string }> = {
  menunggu: { bg: "#FEBC2E20", text: "#B8730A", label: "Menunggu" },
  perlu_tindakan: { bg: "#C0392B20", text: "#C0392B", label: "Perlu Tindakan" },
  diterima: { bg: "#0F7A6B20", text: "#0F7A6B", label: "Diterima" },
  ditolak: { bg: "#C0392B20", text: "#A5271A", label: "Ditolak" },
};

const CategoryIcon = ({ icon, name }: { icon: string | null; name: string }) => {
  if (icon) {
    return (
      <span
        className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-semibold"
        style={{ backgroundColor: colors.primary }}
        title={name}
      >
        {icon.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-semibold"
      style={{ backgroundColor: colors.primary }}
      title={name}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
};

const StatusBadge = ({ status }: { status: VerificationStatus }) => {
  const { bg, text, label } = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
};

const TableHeader = ({
  allSelected,
  onSelectAll,
}: {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
}) => (
  <thead>
    <tr className="border-b border-sigap-border">
      <th className="text-left p-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="w-4 h-4 rounded border-sigap-border text-sigap-primary focus:ring-sigap-primary"
        />
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        ID
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        Jenis
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        Desa
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        Kecamatan
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        Tanggal
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        Status
      </th>
      <th className="text-left p-3 text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
        Aksi
      </th>
    </tr>
  </thead>
);

const TableRow = ({
  item,
  isSelected,
  onSelect,
  onViewDetails,
  onTakeAction,
}: {
  item: VerificationQueueItem;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onViewDetails?: ((id: string) => void) | undefined;
  onTakeAction?: ((id: string) => void) | undefined;
}) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <tr
      className="border-b border-sigap-border hover:bg-sigap-surface transition-colors"
      style={{ borderBottomColor: colors.border }}
    >
      <td className="p-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(item.id, e.target.checked)}
          className="w-4 h-4 rounded border-sigap-border text-sigap-primary focus:ring-sigap-primary"
        />
      </td>
      <td className="p-3">
        <span className="text-sm font-mono text-sigap-textSecondary">
          # {item.shortCode}
        </span>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <CategoryIcon icon={item.categoryIcon} name={item.categoryName} />
          <span className="text-sm text-sigap-textPrimary">{item.categoryName}</span>
        </div>
      </td>
      <td className="p-3">
        <span className="text-sm text-sigap-textPrimary">{item.villageName}</span>
      </td>
      <td className="p-3">
        <span className="text-sm text-sigap-textPrimary">{item.districtName}</span>
      </td>
      <td className="p-3">
        <span className="text-sm text-sigap-textSecondary">
          {formatDate(item.createdAt)}
        </span>
      </td>
      <td className="p-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewDetails?.(item.id)}
            className="px-3 py-1 text-xs font-medium text-sigap-primary hover:bg-sigap-primary hover:text-white rounded transition-colors"
            style={{ borderColor: colors.primary, borderWidth: 1 }}
          >
            Detail
          </button>
          {item.status === "perlu_tindakan" && (
            <button
              type="button"
              onClick={() => onTakeAction?.(item.id)}
              className="px-3 py-1 text-xs font-medium text-white bg-sigap-primary hover:bg-sigap-primaryHover rounded transition-colors"
            >
              Tindakan
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

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
    <div className="flex items-center justify-between px-4 py-3 border-t border-sigap-border" style={{ borderTopColor: colors.border }}>
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
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm font-medium text-sigap-textSecondary border border-sigap-border rounded hover:bg-sigap-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ borderColor: colors.border }}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export function VerificationQueue({
  data,
  selectedIds = new Set(),
  onSelectionChange,
  onPageChange,
  onViewDetails,
  onTakeAction,
  isLoading = false,
  isError = false,
  errorMessage = "Gagal memuat data",
  onRetry,
}: VerificationQueueProps) {
  const { items, pagination } = data;
  const { page, totalPages } = pagination;

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(items.map((item) => item.id));
      onSelectionChange?.(allIds);
    } else {
      onSelectionChange?.(new Set());
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    onSelectionChange?.(newSelection);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-sigap-border overflow-hidden" style={{ borderColor: colors.border }}>
        <div className="p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-sigap-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-sigap-textTertiary">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg border border-sigap-border overflow-hidden" style={{ borderColor: colors.border }}>
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "#ECC4BD" }}>
            <svg width="24" height="24" fill="none" stroke={colors.perluTindakan} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm text-sigap-textSecondary mb-4">{errorMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: colors.primary }}
            >
              Coba lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-sigap-border overflow-hidden" style={{ borderColor: colors.border }}>
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.surface }}>
            <svg width="24" height="24" fill="none" stroke={colors.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-sm text-sigap-textSecondary">Tidak ada data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-sigap-border overflow-hidden" style={{ borderColor: colors.border }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <TableHeader allSelected={allSelected} onSelectAll={handleSelectAll} />
          <tbody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                item={item}
                isSelected={selectedIds.has(item.id)}
                onSelect={handleSelect}
                onViewDetails={onViewDetails}
                onTakeAction={onTakeAction}
              />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange ?? (() => {})} />
      )}
    </div>
  );
}
