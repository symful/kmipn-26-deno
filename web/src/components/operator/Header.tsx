import { colors } from "../../theme/tokens";

interface HeaderProps {
  onMenuClick?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filterActive?: boolean;
  onFilterClick?: () => void;
  userInitials?: string;
  onAvatarClick?: () => void;
}

export function Header({
  onMenuClick,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Cari...",
  filterActive = false,
  onFilterClick,
  userInitials = "BM",
  onAvatarClick,
}: HeaderProps) {
  return (
    <header
      className="h-[58px] bg-white border-b border-sigap-border flex items-center px-4 gap-4 shrink-0"
      style={{ borderBottomColor: colors.border }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="p-2 -ml-2 rounded-lg hover:bg-sigap-surface transition-colors shrink-0"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-sigap-textSecondary"
        >
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sigap-textMuted pointer-events-none"
          >
            <path
              d="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM14 14l-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-9 pl-9 pr-4 bg-sigap-surface rounded-full text-sm text-sigap-textPrimary placeholder:text-sigap-textMuted border border-transparent focus:border-sigap-primary focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onFilterClick}
          aria-label="Toggle filter"
          className={`h-9 px-3 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
            filterActive
              ? "bg-sigap-primary text-white"
              : "bg-sigap-surface text-sigap-textSecondary border border-sigap-border hover:border-sigap-primary hover:text-sigap-primary"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1.5 3.5h11M3 7h8M5 10.5h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>Filter</span>
        </button>

        <button
          type="button"
          onClick={onAvatarClick}
          aria-label="User menu"
          className="w-9 h-9 rounded-full bg-sigap-primary text-white text-xs font-semibold flex items-center justify-center hover:bg-sigap-primaryHover transition-colors"
        >
          {userInitials}
        </button>
      </div>
    </header>
  );
}
