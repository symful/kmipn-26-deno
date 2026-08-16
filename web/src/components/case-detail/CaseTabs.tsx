import { colors } from "../../theme/tokens";

type TabId =
  | "ringkasan"
  | "bukti-laporan"
  | "verifikasi"
  | "tugas-progres"
  | "riwayat-audit";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "bukti-laporan", label: "Bukti & Laporan" },
  { id: "verifikasi", label: "Verifikasi" },
  { id: "tugas-progres", label: "Tugas & Progres" },
  { id: "riwayat-audit", label: "Riwayat Audit" },
];

interface CaseTabsProps {
  activeTab?: TabId;
  onTabChange?: (tabId: TabId) => void;
}

export function CaseTabs({
  activeTab = "ringkasan",
  onTabChange,
}: CaseTabsProps) {
  return (
    <div
      className="flex border-b"
      style={{ borderColor: colors.border }}
      role="tablist"
      aria-orientation="horizontal"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange?.(tab.id)}
            className="
              flex-1 px-4 py-3 text-sm font-medium text-center
              transition-colors duration-150
              hover:text-sigap-primary
              focus:outline-none focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-inset
            "
            style={{
              color: isActive ? colors.primary : colors.textSecondary,
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: isActive ? colors.primary : "transparent",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
