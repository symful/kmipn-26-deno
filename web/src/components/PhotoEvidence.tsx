import { colors, sidebarColors } from "../theme/tokens";

export interface PhotoEvidenceProps {
  src: string;
  alt?: string;
  label?: string;
  className?: string;
}

export function PhotoEvidence({
  src,
  alt = "Bukti foto",
  label = "FOTO SIMULASI",
  className = "",
}: PhotoEvidenceProps) {
  return (
    <figure
      className={className}
      style={{
        position: "relative",
        margin: 0,
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          aspectRatio: "1.8",
          objectFit: "cover",
          display: "block",
          borderRadius: "8px",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "8px",
          bottom: "8px",
          padding: "5px 6px",
          borderRadius: "4px",
          background: `${sidebarColors.sidebarBg}bb`,
          color: colors.surface,
          fontSize: "7px",
          fontWeight: 500,
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: "0.5px",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </figure>
  );
}
