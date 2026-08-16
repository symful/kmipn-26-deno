import { colors } from "../../theme/tokens";

interface PhotoTileProps {
  src: string;
  alt?: string;
  onClick?: () => void;
}

function PhotoTile({ src, alt = "", onClick }: PhotoTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden rounded flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2"
      style={{
        width: 64,
        height: 64,
        padding: 0,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
      }}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </button>
  );
}

interface OverflowIndicatorProps {
  count: number;
}

function OverflowIndicator({ count }: OverflowIndicatorProps) {
  return (
    <div
      className="relative flex-shrink-0 flex items-center justify-center rounded-full"
      style={{
        width: 64,
        height: 64,
        backgroundColor: colors.border,
      }}
    >
      <span
        className="text-sm font-semibold"
        style={{ color: colors.textSecondary }}
      >
        +{count}
      </span>
    </div>
  );
}

interface SupportingGalleryProps {
  photos: string[];
  totalCount: number;
  onPhotoClick?: (index: number) => void;
  onViewAllClick?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function SupportingGalleryLoadingState() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-semibold animate-pulse"
          style={{ color: colors.border, width: 150 }}
        >
          &nbsp;
        </span>
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 rounded animate-pulse"
            style={{
              width: 64,
              height: 64,
              backgroundColor: colors.border,
              border: `1px solid ${colors.border}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function SupportingGalleryEmptyState() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: colors.textPrimary }}
        >
          Laporan pendukung (0)
        </h2>
      </div>
      <div className="flex items-center justify-center py-6">
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Tidak ada foto pendukung
        </p>
      </div>
    </div>
  );
}

export function SupportingGalleryErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: colors.textPrimary }}
        >
          Laporan pendukung
        </h2>
      </div>
      <div
        className="flex flex-col items-center justify-center gap-3 py-6 px-4 rounded-lg"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <p className="text-sm text-center" style={{ color: colors.perluTindakan }}>
          {error || "Gagal memuat foto"}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: colors.primary, color: "white" }}
          >
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}

const MAX_VISIBLE_PHOTOS = 3;

export function SupportingGallery({
  photos,
  totalCount,
  onPhotoClick,
  onViewAllClick,
  loading,
  error,
  onRetry,
}: SupportingGalleryProps) {
  if (loading) {
    return <SupportingGalleryLoadingState />;
  }

  if (error) {
    return <SupportingGalleryErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  }

  if (!photos || photos.length === 0 || totalCount === 0) {
    return <SupportingGalleryEmptyState />;
  }

  const visiblePhotos = photos.slice(0, MAX_VISIBLE_PHOTOS);
  const overflowCount = totalCount - MAX_VISIBLE_PHOTOS;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: colors.textPrimary }}
        >
          Laporan pendukung ({totalCount})
        </h2>
        {onViewAllClick && totalCount > MAX_VISIBLE_PHOTOS && (
          <button
            type="button"
            onClick={onViewAllClick}
            className="text-xs transition-colors hover:underline"
            style={{ color: colors.primary }}
          >
            Lihat semua
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {visiblePhotos.map((photoUrl, index) => (
          <PhotoTile
            key={`photo-${index}`}
            src={photoUrl}
            alt={`Laporan pendukung ${index + 1}`}
            onClick={() => onPhotoClick?.(index)}
          />
        ))}

        {overflowCount > 0 && (
          <OverflowIndicator count={overflowCount} />
        )}
      </div>
    </div>
  );
}
