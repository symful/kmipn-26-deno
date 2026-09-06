import { bgSoft, colors, radius, spacing } from "@/theme/tokens";

type SkeletonBaseProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
};

type SkeletonProps = SkeletonBaseProps & {
  loading?: boolean;
};

const _skeletonBase = colors.surfaceMuted;
const _shimmerColor = bgSoft;
const _borderColor = colors.borderCard;

const SkeletonBox = ({
  width,
  height,
  borderRadius = 4,
  className = "",
}: SkeletonBaseProps) => {
  const widthStyle =
    width !== undefined
      ? typeof width === "number"
        ? `${width}px`
        : width
      : undefined;
  return (
    <span
      className={`skeleton-box ${className}`}
      aria-hidden="true"
      style={{
        display: "block",
        width: widthStyle,
        height: `${height}px`,
        borderRadius: `${borderRadius}px`,
        backgroundColor: _skeletonBase,
        flexShrink: 0,
      }}
    />
  );
};

type SkeletonTextProps = {
  width?: number | string;
  lines?: number;
  height?: number;
};

const SkeletonText = ({ width, lines = 1, height = 12 }: SkeletonTextProps) => {
  if (lines === 1) {
    const p = width !== undefined ? { width } : {};
    return <SkeletonBox {...p} height={height} borderRadius={4} />;
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: `${spacing["8"]}px`,
        width: "100%",
      }}
    >
      {Array.from({ length: lines }).map((_, i) => {
        const isLast = i === lines - 1 && lines > 1;
        const w = isLast ? "70%" : width;
        const p = w !== undefined ? { width: w } : {};
        return <SkeletonBox key={i} {...p} height={height} borderRadius={4} />;
      })}
    </div>
  );
};

type SkeletonCardProps = {
  width?: number | string;
  height?: number;
};

const SkeletonCard = ({ width, height = 80 }: SkeletonCardProps) => {
  const w =
    width !== undefined
      ? typeof width === "number"
        ? `${width}px`
        : width
      : undefined;
  return (
    <div
      aria-hidden="true"
      style={{
        width: w,
        height: `${height}px`,
        padding: `${spacing.md}px`,
        backgroundColor: colors.bgCard,
        border: `1px solid ${_borderColor}`,
        borderRadius: radius.md,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: `${spacing.md}px`,
      }}
    >
      <SkeletonBox width={40} height={40} borderRadius={Number(radius.sm)} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: `${spacing["8"]}px`,
        }}
      >
        <SkeletonBox height={14} borderRadius={4} />
        <SkeletonBox width="40%" height={11} borderRadius={4} />
      </div>
    </div>
  );
};

type SkeletonListProps = {
  itemCount?: number;
  itemHeight?: number;
};

const SkeletonList = ({
  itemCount = 3,
  itemHeight = 72,
}: SkeletonListProps) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: `${spacing.sm}px`,
        width: "100%",
      }}
    >
      {Array.from({ length: itemCount }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            height: `${itemHeight}px`,
            backgroundColor: colors.bgCard,
            border: `1px solid ${_borderColor}`,
            borderRadius: radius.md,
          }}
        />
      ))}
    </div>
  );
};

type SkeletonCircleProps = {
  size?: number;
};

const SkeletonCircle = ({ size = 48 }: SkeletonCircleProps) => {
  return <SkeletonBox width={size} height={size} borderRadius={size / 2} />;
};

export const Skeleton = Object.assign(
  ({
    loading = false,
    width,
    height,
    borderRadius,
    className,
  }: SkeletonProps) => {
    const p = {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(borderRadius !== undefined ? { borderRadius } : {}),
      ...(className !== undefined ? { className } : {}),
    };
    const skeleton = <SkeletonBox {...p} />;
    if (loading) {
      return (
        <div role="status" aria-busy="true" aria-label="Memuat…">
          {skeleton}
        </div>
      );
    }
    return skeleton;
  },
  {
    Text: SkeletonText,
    Card: SkeletonCard,
    List: SkeletonList,
    Circle: SkeletonCircle,
  },
);

export default Skeleton;

const _shimmerStyles = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-box {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    ${_skeletonBase} 0%,
    ${_shimmerColor} 50%,
    ${_skeletonBase} 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1500ms ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-box {
    animation: none;
    background: ${_skeletonBase};
  }
}
`;

if (typeof document !== "undefined") {
  const id = "skeleton-shimmer-styles";
  if (!document.getElementById(id)) {
    const el = document.createElement("style");
    el.id = id;
    el.textContent = _shimmerStyles;
    document.head.appendChild(el);
  }
}
