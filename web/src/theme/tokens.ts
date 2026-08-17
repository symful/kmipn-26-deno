export const colors = {
  primary: "#0f7a6b",
  primaryDark: "#0a5c50",
  primaryLight: "#e2f1ee",

  warning: "#b8730a",
  warningBg: "#f8ecd6",

  danger: "#c0392b",
  dangerBg: "#f8e2de",

  info: "#2563eb",
  infoBg: "#e5edfd",

  bgSurface: "#f4f5f3",
  bgCard: "#ffffff",
  background: "#e6e8e3",

  borderCard: "#e4e7e2",
  border: "#e4e7e2",

  textPrimary: "#17191c",
  textSecondary: "#3a3f45",
  textTertiary: "#616770",
  textMuted: "#8a9099",

  perluTindakan: "#c0392b",
  diproses: "#2563eb",
  selesai: "#22C55E",

  offlineBg: "#f8ecd6",
  offlineBorder: "#ecd7a6",
  offlineText: "#8a5808",
  offlineDot: "#b8730a",
} as const;

export const statusColors = {
  perluTindakan: "#c0392b",
  diproses: "#2563eb",
  selesai: "#22C55E",
} as const;

export const surfaceColors = {
  offlineBg: "#f8ecd6",
  offlineBorder: "#ecd7a6",
  offlineText: "#8a5808",
  offlineDot: "#b8730a",
  textMuted: "#8a9099",
} as const;

export const sidebarColors = {
  sidebarBg: "#16302B",
  sidebarText: "#CFE4DF",
  sidebarTextHover: "#FFFFFF",
  sidebarTextMuted: "#9DC0B9",
  sidebarDivider: "#234A43",
  sidebarAccent: "#7FA8A0",
} as const;

export const extendedColors = {
  infoChartBar: "#C7D7FB",
  dangerTextStrong: "#A5271A",
  dangerBorder: "#ECC4BD",
  warningText: "#8A5808",
  warningBorder: "#ECD7A6",
  successBorder: "#BFE0D9",
  bgScreen: "#F9FAF8",
  bgSoft: "#EEF0EC",
  borderSoft: "#D3D7D0",
  warningTextStrong: "#7A4D06",
  textSecondary: "#4a5058",
} as const;

export const sidebarBg = sidebarColors.sidebarBg;
export const sidebarText = sidebarColors.sidebarText;
export const sidebarTextHover = sidebarColors.sidebarTextHover;
export const sidebarTextMuted = sidebarColors.sidebarTextMuted;
export const sidebarDivider = sidebarColors.sidebarDivider;
export const sidebarAccent = sidebarColors.sidebarAccent;

export const bgSoft = extendedColors.bgSoft;
export const dangerBorder = extendedColors.dangerBorder;
export const dangerTextStrong = extendedColors.dangerTextStrong;

export const fontFamilies = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

export const fontSizes = {
  "10": "10px",
  "12": "12px",
  "14": "14px",
  "16": "16px",
  "18": "18px",
  "20": "20px",
  "24": "24px",
  "30": "30px",
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeights = {
  "125": "1.25",
  "130": "1.3",
  "135": "1.35",
  "140": "1.4",
  "145": "1.45",
  "155": "1.55",
} as const;

export const letterSpacings = {
  tight: "-0.01em",
  label: "0.04em",
} as const;

export const spacing = {
  "4": "4px",
  "8": "8px",
  "13": "13px",
  "18": "18px",
  "24": "24px",
  xs: "5px",
  sm: "8px",
  md: "13px",
  lg: "18px",
  xl: "24px",
  "2": "2px",
  "6": "6px",
  "7": "7px",
  "9": "9px",
  "10": "10px",
  "11": "11px",
  "12": "12px",
  "14": "14px",
  "15": "15px",
  "17": "17px",
  "20": "20px",
  "22": "22px",
  "28": "28px",
  "32": "32px",
  "34": "34px",
  "56": "56px",
  "60": "60px",
  "90": "90px",
} as const;

export const radius = {
  sm: "5px",
  md: "11px",
  lg: "13px",
  pill: "999px",
  card: "12px",
  btn: "10px",
  "1": "1px",
  "2": "2px",
  "3": "3px",
  "4": "4px",
  "6": "6px",
  "7": "7px",
  "8": "8px",
  "9": "9px",
  "12": "12px",
  "14": "14px",
  "16": "16px",
  "34": "34px",
  "44": "44px",
} as const;

export const shadows = {
  buttonPrimary: "0 10px 22px -12px rgba(15,122,107,0.9)",
  fab: "0 10px 20px rgba(15, 122, 107, 0.9)",
  phoneBezel: "0 28px 60px rgba(31, 34, 38, 0.5)",
  browserFrame: "0 24px 60px rgba(0,0,0,0.4)",
  mapLegend: "0 6px 16px rgba(0, 0, 0, 0.3)",
  toggleThumb: "0 1px 2px rgba(0, 0, 0, 0.2)",
  card: "0 24px 60px -30px rgba(0,0,0,0.4)",
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

export const caseStatusColors: Record<string, string> = {
  menunggu: "#FBBF24",
  dalam_proses: "#3B82F6",
  perlu_tindakan: "#EF4444",
  diterima: "#22C55E",
  ditolak: "#6B7280",
};

export const caseStatusLabels: Record<string, string> = {
  menunggu: "Menunggu",
  dalam_proses: "Dalam Proses",
  perlu_tindakan: "Perlu Tindakan",
  diterima: "Diterima",
  ditolak: "Ditolak",
};
