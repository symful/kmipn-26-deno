import { colors, fontFamily } from "../../theme/tokens";

interface MapThumbnailProps {
  lat: number;
  lng: number;
  onViewFullMap?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function MapThumbnailLoadingState() {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative w-[150px] h-[150px] rounded-lg overflow-hidden animate-pulse"
        style={{
          backgroundImage: `
            linear-gradient(${colors.border} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.border} 1px, transparent 1px)
          `,
          backgroundSize: "12px 12px",
          backgroundColor: colors.surface,
        }}
      />
      <span
        className="text-[10px] animate-pulse"
        style={{
          fontFamily: fontFamily.mono,
          color: colors.border,
        }}
      >
        &nbsp;
      </span>
    </div>
  );
}

export function MapThumbnailEmptyState() {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative w-[150px] h-[150px] rounded-lg overflow-hidden flex items-center justify-center"
        style={{
          backgroundImage: `
            linear-gradient(${colors.border} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.border} 1px, transparent 1px)
          `,
          backgroundSize: "12px 12px",
          backgroundColor: colors.surface,
        }}
      >
        <span className="text-sm" style={{ color: colors.textMuted }}>
          Tidak ada koordinat
        </span>
      </div>
    </div>
  );
}

export function MapThumbnailErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative w-[150px] h-[150px] rounded-lg overflow-hidden flex flex-col items-center justify-center gap-2"
        style={{
          backgroundImage: `
            linear-gradient(${colors.border} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.border} 1px, transparent 1px)
          `,
          backgroundSize: "12px 12px",
          backgroundColor: colors.surface,
        }}
      >
        <p className="text-xs text-center px-2" style={{ color: colors.perluTindakan }}>
          {error || "Gagal memuat peta"}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold px-2 py-1 rounded transition-colors hover:opacity-90"
            style={{ backgroundColor: colors.primary, color: "white" }}
          >
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}

export function MapThumbnail({ lat, lng, onViewFullMap, loading, error, onRetry }: MapThumbnailProps) {
  if (loading) {
    return <MapThumbnailLoadingState />;
  }

  if (error) {
    return <MapThumbnailErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  }

  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return <MapThumbnailEmptyState />;
  }

  const coordinateText = `${lat}, ${lng}`;

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative w-[150px] h-[150px] rounded-lg overflow-hidden"
        style={{
          backgroundImage: `
            linear-gradient(${colors.border} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.border} 1px, transparent 1px)
          `,
          backgroundSize: "12px 12px",
          backgroundColor: colors.surface,
        }}
      >
        <svg
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full"
          width="24"
          height="32"
          viewBox="0 0 24 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 0C5.373 0 0 5.373 0 12c0 8 12 20 12 20s12-12 12-20c0-6.627-5.373-12-12-12z"
            fill="#EF4444"
          />
          <circle cx="12" cy="12" r="4" fill="white" />
        </svg>
      </div>

      <span
        className="text-[10px]"
        style={{
          fontFamily: fontFamily.mono,
          color: colors.textTertiary,
        }}
      >
        {coordinateText}
      </span>

      <button
        type="button"
        onClick={onViewFullMap}
        className="text-xs hover:underline w-fit"
        style={{ color: colors.primary }}
      >
        Buka peta penuh
      </button>
    </div>
  );
}
