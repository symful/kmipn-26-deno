import {
  colors,
  extendedColors,
  primaryLightVariant,
} from "../../theme/tokens";

interface FilterBarProps {
  kecamatanOptions: { value: string; label: string }[];
  kategoriOptions: { value: string; label: string }[];
  statusOptions?: { value: string; label: string }[];
  selectedKecamatan: string;
  selectedKategori: string;
  selectedStatus?: string;
  viewMode?: "peta" | "daftar";
  activeFilters: string[];
  searchValue?: string;
  onKecamatanChange: (value: string) => void;
  onKategoriChange: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onViewModeChange?: (value: "peta" | "daftar") => void;
  onRemoveFilter: (filter: string) => void;
  onResetFilters: () => void;
  onSearchChange?: (value: string) => void;
  totalCount: number;
}

export const FilterBar = ({
  kecamatanOptions,
  kategoriOptions,
  statusOptions,
  selectedKecamatan,
  selectedKategori,
  selectedStatus,
  viewMode,
  activeFilters,
  searchValue,
  onKecamatanChange,
  onKategoriChange,
  onStatusChange,
  onViewModeChange,
  onRemoveFilter,
  onResetFilters,
  onSearchChange,
  totalCount,
}: FilterBarProps) => {
  return (
    <div
      className="border-b border-neutral-200 flex items-center gap-2.5 px-7"
      style={{ height: 56, backgroundColor: extendedColors.bgScreen }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer"
        style={{
          borderColor: colors.borderCard,
          color: colors.textSecondary,
          backgroundColor: colors.bgCard,
        }}
      >
        <select
          value={selectedKecamatan}
          onChange={(e) => onKecamatanChange(e.target.value)}
          className="bg-transparent focus:outline-none cursor-pointer"
          style={{
            color: colors.textSecondary,
            fontWeight: 600,
            fontSize: 12.5,
          }}
        >
          <option value="">Semua Kecamatan</option>
          {kecamatanOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer"
        style={{
          borderColor: colors.borderCard,
          color: colors.textSecondary,
          backgroundColor: colors.bgCard,
        }}
      >
        <select
          value={selectedKategori}
          onChange={(e) => onKategoriChange(e.target.value)}
          className="bg-transparent focus:outline-none cursor-pointer"
          style={{ color: colors.textSecondary, fontSize: 12.5 }}
        >
          <option value="">Semua Kategori</option>
          {kategoriOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {statusOptions && onStatusChange && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{
            borderColor: colors.borderCard,
            color: colors.textSecondary,
            backgroundColor: colors.bgCard,
          }}
        >
          <select
            value={selectedStatus ?? ""}
            onChange={(e) => onStatusChange(e.target.value)}
            className="bg-transparent focus:outline-none cursor-pointer"
            style={{ color: colors.textSecondary, fontSize: 12.5 }}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeFilters.map((filter) => (
        <div
          key={filter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: colors.primaryLight,
            border: `1px solid ${primaryLightVariant}`,
            color: colors.primaryDark,
          }}
        >
          <span>{filter}</span>
          <button
            onClick={() => onRemoveFilter(filter)}
            aria-label={`Hapus filter ${filter}`}
            className="cursor-pointer hover:opacity-70 min-h-11 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2 focus-visible:outline-none rounded"
            style={{ fontSize: 10 }}
          >
            ✕
          </button>
        </div>
      ))}

      {(selectedKecamatan ||
        selectedKategori ||
        (activeFilters?.length ?? 0) > 0) && (
        <button
          onClick={onResetFilters}
          className="text-xs font-semibold cursor-pointer hover:underline"
          style={{ color: colors.primary }}
        >
          Reset
        </button>
      )}

      <div className="flex items-center gap-3 ml-auto">
        <span className="text-xs" style={{ color: colors.textTertiary }}>
          <b style={{ color: colors.textPrimary }}>{totalCount}</b> kasus
        </span>

        {viewMode && onViewModeChange && (
          <div
            className="flex overflow-hidden rounded-lg"
            style={{ border: `1px solid ${colors.borderCard}` }}
          >
            <button
              onClick={() => onViewModeChange("peta")}
              className="px-3.5 py-1.5 text-xs font-semibold transition-colors"
              style={
                viewMode === "peta"
                  ? { backgroundColor: colors.primary, color: colors.bgCard }
                  : {
                      backgroundColor: colors.bgCard,
                      color: colors.textTertiary,
                    }
              }
            >
              Peta
            </button>
            <button
              onClick={() => onViewModeChange("daftar")}
              className="px-3.5 py-1.5 text-xs font-semibold transition-colors"
              style={
                viewMode === "daftar"
                  ? { backgroundColor: colors.primary, color: colors.bgCard }
                  : {
                      backgroundColor: colors.bgCard,
                      color: colors.textTertiary,
                    }
              }
            >
              Daftar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
