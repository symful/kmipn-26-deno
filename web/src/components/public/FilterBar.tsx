import { colors } from "../../theme/tokens";

export interface FilterOption {
  value: string;
  label: string;
}

export interface ActiveFilter {
  id: string;
  label: string;
}

export interface FilterBarProps {
  wilayahOptions?: FilterOption[];
  kategoriOptions?: FilterOption[];
  selectedWilayah?: string;
  selectedKategori?: string;
  activeFilters?: ActiveFilter[];
  totalCount?: number;
  viewMode?: "peta" | "daftar";
  onWilayahChange?: (value: string) => void;
  onKategoriChange?: (value: string) => void;
  onRemoveFilter?: (id: string) => void;
  onReset?: () => void;
  onViewModeChange?: (mode: "peta" | "daftar") => void;
}

export function FilterBar({
  wilayahOptions = [],
  kategoriOptions = [],
  selectedWilayah = "",
  selectedKategori = "",
  activeFilters = [],
  totalCount = 0,
  viewMode = "daftar",
  onWilayahChange,
  onKategoriChange,
  onRemoveFilter,
  onReset,
  onViewModeChange,
}: FilterBarProps) {
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div
      className="flex items-center gap-3 px-4 bg-white border-b border-sigap-border"
      style={{ height: 56, borderBottom: `1px solid ${colors.border}` }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <select
          value={selectedWilayah}
          onChange={(e) => onWilayahChange?.(e.target.value)}
          className="h-8 px-2 text-sm bg-white border border-sigap-border rounded-sm text-sigap-textPrimary focus:outline-none focus:border-sigap-primary cursor-pointer"
          style={{ minWidth: 120 }}
        >
          <option value="">Wilayah</option>
          {wilayahOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={selectedKategori}
          onChange={(e) => onKategoriChange?.(e.target.value)}
          className="h-8 px-2 text-sm bg-white border border-sigap-border rounded-sm text-sigap-textPrimary focus:outline-none focus:border-sigap-primary cursor-pointer"
          style={{ minWidth: 120 }}
        >
          <option value="">Kategori</option>
          {kategoriOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <div
            className="w-px h-5 bg-sigap-border mx-1"
            style={{ backgroundColor: colors.border }}
          />
        )}

        {activeFilters.map((filter) => (
          <div
            key={filter.id}
            className="flex items-center h-7 px-2 gap-1 rounded-sm bg-sigap-primary text-white text-xs font-medium"
            style={{ backgroundColor: colors.primary }}
          >
            <span>{filter.label}</span>
            <button
              onClick={() => onRemoveFilter?.(filter.id)}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
              aria-label={`Remove ${filter.label} filter`}
            >
              <span style={{ fontSize: 10, lineHeight: 1 }}>x</span>
            </button>
          </div>
        ))}

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-xs text-sigap-primary hover:underline cursor-pointer bg-transparent border-none p-0"
            style={{ color: colors.primary }}
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span
          className="text-sm font-semibold text-sigap-textPrimary whitespace-nowrap"
          style={{ color: colors.textPrimary }}
        >
          {totalCount} kasus
        </span>

        <div
          className="flex items-center rounded-sm overflow-hidden border"
          style={{ borderColor: colors.border, height: 32 }}
        >
          <button
            onClick={() => onViewModeChange?.("peta")}
            className="px-3 h-full text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: viewMode === "peta" ? colors.primary : "white",
              color: viewMode === "peta" ? "white" : colors.textSecondary,
            }}
          >
            Peta
          </button>
          <button
            onClick={() => onViewModeChange?.("daftar")}
            className="px-3 h-full text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: viewMode === "daftar" ? colors.primary : "white",
              color: viewMode === "daftar" ? "white" : colors.textSecondary,
              borderLeft: `1px solid ${colors.border}`,
            }}
          >
            Daftar
          </button>
        </div>
      </div>
    </div>
  );
}
