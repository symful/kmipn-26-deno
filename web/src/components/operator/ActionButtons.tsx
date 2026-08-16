import { useState, useRef, useEffect } from "react";
import { colors } from "../../theme/tokens";

export interface ActionButtonsProps {
  onTinjau?: () => void;
  onArifta?: () => void;
  onTolak?: () => void;
  onPrint?: () => void;
  onBagikan?: () => void;
  onArsipkan?: () => void;
}

const ChevronDownIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 4.5L6 7.5L9 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PrintIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const ShareIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const ArchiveIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="21,8 21,21 3,21 3,8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

export function ActionButtons({
  onTinjau,
  onArifta,
  onTolak,
  onPrint,
  onBagikan,
  onArsipkan,
}: ActionButtonsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleDropdownItemClick = (action?: () => void) => {
    action?.();
    setDropdownOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onTinjau}
        className="h-8 px-3 rounded-btn text-xs font-semibold text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: colors.diproses }}
      >
        Tinjau
      </button>

      <button
        type="button"
        onClick={onArifta}
        className="h-8 px-3 rounded-btn text-xs font-semibold border transition-colors hover:bg-primary-50"
        style={{
          borderColor: colors.primary,
          color: colors.primary,
        }}
      >
        Arifta
      </button>

      <button
        type="button"
        onClick={onTolak}
        className="h-8 px-3 rounded-btn text-xs font-semibold border transition-colors hover:bg-danger-100"
        style={{
          borderColor: colors.perluTindakan,
          color: colors.perluTindakan,
        }}
      >
        Tolak
      </button>

      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="h-8 px-3 rounded-btn text-xs font-semibold border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-50 flex items-center gap-1"
          style={{ color: colors.textTertiary }}
        >
          Lainnya
          <span style={{ color: colors.textTertiary }}>
            <ChevronDownIcon />
          </span>
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 top-full mt-1 min-w-[140px] bg-white border border-neutral-200 rounded-lg shadow-card py-1 z-50"
          >
            <button
              type="button"
              onClick={() => handleDropdownItemClick(onPrint)}
              className="w-full px-3 py-2 text-xs text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 transition-colors"
            >
              <span style={{ color: colors.textTertiary }}>
                <PrintIcon />
              </span>
              Print
            </button>
            <button
              type="button"
              onClick={() => handleDropdownItemClick(onBagikan)}
              className="w-full px-3 py-2 text-xs text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 transition-colors"
            >
              <span style={{ color: colors.textTertiary }}>
                <ShareIcon />
              </span>
              Bagikan
            </button>
            <button
              type="button"
              onClick={() => handleDropdownItemClick(onArsipkan)}
              className="w-full px-3 py-2 text-xs text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 transition-colors"
            >
              <span style={{ color: colors.textTertiary }}>
                <ArchiveIcon />
              </span>
              Arsipkan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
