export const colors = {
  primary: "#0f7a6b",
  primaryHover: "#0a5c50",
  perluTindakan: "#c0392b",
  diproses: "#2563eb",
  selesai: "#0f7a6b",
  offlineBg: "#f8ecd6",
  offlineBorder: "#ecd7a6",
  offlineText: "#8a5808",
  offlineDot: "#b8730a",
  background: "#e6e8e3",
  surface: "#f4f5f3",
  border: "#e4e7e2",
  textPrimary: "#17191c",
  textSecondary: "#4a5058",
  textTertiary: "#616770",
  textMuted: "#8a9099",
} as const;

export const spacing = {
  xs: 5,
  sm: 8,
  md: 13,
  lg: 18,
  xl: 24,
} as const;

export const radius = {
  sm: 5,
  md: 11,
  lg: 13,
} as const;

export const fontFamily = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

export const statusColor = (status: string): string => {
  if (status === "submitted" || status === "needs_survey")
    return colors.perluTindakan;
  if (
    status === "under_review" ||
    status === "verified" ||
    status === "in_progress"
  )
    return colors.diproses;
  if (status === "resolved") return colors.selesai;
  return colors.textTertiary;
};

export const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    submitted: "Perlu Tindakan",
    under_review: "Sedang Ditinjau",
    verified: "Terverifikasi",
    in_progress: "Sedang Dikerjakan",
    resolved: "Selesai",
    rejected: "Ditolak",
    duplicate_merged: "Digabung",
    needs_survey: "Perlu Survei",
  };
  return labels[status] ?? status;
};
