import { type CSSProperties } from "react";

export interface GalleryItem {
  src: string;
  alt?: string;
  caption?: string;
}

interface GalleryProps {
  items: GalleryItem[];
  columns?: 2 | 3;
  className?: string;
  style?: CSSProperties;
}

export function Gallery({
  items,
  columns = 3,
  className = "",
  style,
}: GalleryProps) {
  return (
    <div
      className={`grid gap-4 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        ...style,
      }}
    >
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div
            className="rounded-lg overflow-hidden bg-sigap-bgSurface"
            style={{ aspectRatio: "4 / 3" }}
          >
            <img
              src={item.src}
              alt={item.alt ?? item.caption ?? ""}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          {item.caption && (
            <span
              className="text-xs leading-snug"
              style={{ color: "var(--color-text-secondary, #3a3f45)" }}
            >
              {item.caption}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
