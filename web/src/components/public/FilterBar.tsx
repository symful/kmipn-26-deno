import { colors, extendedColors } from "../../theme/tokens";

interface FilterBarProps {
  wilayahOptions: { value: string; label: string }[];
  kategoriOptions: { value: string; label: string }[];
  selectedWilayah: string;
  selectedKategori: string;
  viewMode: "peta" | "daftar";
  activeFilters: string[];
  onWilayahChange: (value: string) => void;
  onKategoriChange: (value: string) => void;
  onViewModeChange: (value: "peta" | "daftar") => void;
  onRemoveFilter: (filter: string) => void;
  onResetFilters: () => void;
  totalCount: number;
}

export const FilterBar = ({
  wilayahOptions,
  kategoriOptions,
  selectedWilayah,
  selectedKategori,
  viewMode,
  activeFilters,
  onWilayahChange,
  onKategoriChange,
  onViewModeChange,
  onRemoveFilter,
  onResetFilters,
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
          borderColor: colors.border,
          color: colors.textSecondary,
          backgroundColor: colors.bgCard,
        }}
      >
        <select
          value={selectedWilayah}
          onChange={(e) => onWilayahChange(e.target.value)}
          className="bg-transparent focus:outline-none cursor-pointer"
          style={{ color: colors.textSecondary, fontWeight: 600, fontSize: 12.5 }}
        >
          <option value="">Semua Wilayah</option>
          {wilayahOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer"
        style={{
          borderColor: colors.border,
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

      {activeFilters.map((filter) => (
        <div
          key={filter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: colors.primaryLight,
            border: `1px solid #bfe0d9`,
            color: colors.primaryDark,
          }}
        >
          <span>{filter}</span>
          <button
            onClick={() => onRemoveFilter(filter)}
            className="cursor-pointer hover:opacity-70"
            style={{ fontSize: 10 }}
          >
            ✕
          </button>
        </div>
      ))}

      {(selectedWilayah || selectedKategori || activeFilters.length > 0) && (
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

        <div
          className="flex overflow-hidden rounded-lg"
          style={{ border: `1px solid ${colors.border}` }}
        >
          <button
            onClick={() => onViewModeChange("peta")}
            className="px-3.5 py-1.5 text-xs font-semibold transition-colors"
            style={
              viewMode === "peta"
                ? { backgroundColor: colors.primary, color: "#fff" }
                : { backgroundColor: colors.bgCard, color: colors.textTertiary }
            }
          >
            Peta
          </button>
          <button
            onClick={() => onViewModeChange("daftar")}
            className="px-3.5 py-1.5 text-xs font-semibold transition-colors"
            style={
              viewMode === "daftar"
                ? { backgroundColor: colors.primary, color: "#fff" }
                : { backgroundColor: colors.bgCard, color: colors.textTertiary }
            }
          >
            Daftar
          </button>
        </div>
      </div>
    </div>
  );
};
