// ─── SIGAP Design Tokens ─────────────────────────────────────────────────────
// Reference: SIGAP_Front-End/README.md §2.2–2.4

export const colors = {
  // Primary / Accent
  primary: "#0f7a6b",
  primaryHover: "#0a5c50",
  primaryDark: "#0a5c50",
  primaryLight: "#e2f1ee",
  primaryBorder: "#bfe0d9",

  // Status: Warning
  warning: "#b8730a",
  warningBg: "#f8ecd6",
  warningText: "#8a5808",

  // Status: Danger / Critical
  danger: "#c0392b",
  dangerBg: "#f8e2de",
  dangerTextStrong: "#a5271a",

  // Status: Info / Processing
  info: "#2563eb",
  infoDark: "#1d4ed8",
  infoBg: "#e5edfd",
  infoChartBar: "#c7d7fb",

  // Status: Success / Done
  success: "#0f7a6b",
  successBg: "#e2f1ee",
  selesai: "#0f7a6b",

  // Semantic aliases
  perluTindakan: "#c0392b",
  diproses: "#2563eb",

  // Backgrounds
  bgOuter: "#e6e8e3",
  bgScreen: "#f9faf8",
  bgPage: "#f9faf8",
  bgSurface: "#f4f5f3",
  bgSoft: "#eef0ec",
  bgCard: "#ffffff",
  surface: "#ffffff",
  background: "#f9faf8",

  // Borders
  borderNeutral: "#e4e7e2",
  borderPanel: "#d3d7d0",
  borderThin: "#eef0ec",
  borderCard: "#e4e7e2",
  border: "#e4e7e2",

  // Text
  textPrimary: "#17191c",
  textSecondary: "#3a3f45",
  textLabel: "#616770",
  textTertiary: "#616770",
  text: "#17191c",
  textMuted: "#8a9099",

  // Category tag
  categoryTagBg: "#e2f1ee",
  categoryTagText: "#0a5c50",

  // Misc
  gridLine: "#dfe4de",
  surfaceMuted: "#eaeee9",
  trafficRed: "#FF5F56",
  trafficYellow: "#FFBD2E",
  trafficGreen: "#27C93F",

  // Offline / legacy aliases
  offlineBg: "#f8ecd6",
  offlineBorder: "#ecd7a6",
  offlineText: "#8a5808",
  offlineDot: "#b8730a",

  resolvedBg: "#dcfce7",
  dangerLight: "#ecc4bd",
  dangerBorder: "#ecc4bd",
  primaryLightVariant: "#bfe0d9",

  borderSoft: "#d3d7d0",
  warningTextStrong: "#7a4d06",
} as const;

export const statusColors = {
  perluTindakan: "#c0392b",
  diproses: "#2563eb",
  selesai: "#0f7a6b",
} as const;

export const surfaceColors = {
  offlineBg: "#f8ecd6",
  offlineBorder: "#ecd7a6",
  offlineText: "#8a5808",
  offlineDot: "#b8730a",
  textMuted: "#8a9099",
} as const;

export const sidebarColors = {
  sidebarBg: "#16302b",
  sidebarText: "#cfe4df",
  sidebarTextHover: "#ffffff",
  sidebarTextMuted: "#7fa8a0",
  sidebarDivider: "#234a43",
  sidebarAccent: "#0f7a6b",
  sidebarActiveBg: "#0f7a6b",
} as const;

export const extendedColors = {
  infoChartBar: "#c7d7fb",
  dangerTextStrong: "#a5271a",
  dangerBorder: "#ecc4bd",
  warningText: "#8a5808",
  warningBorder: "#ecd7a6",
  successBorder: "#bfe0d9",
  bgScreen: "#f9faf8",
  bgSoft: "#eef0ec",
  borderSoft: "#d3d7d0",
  warningTextStrong: "#7a4d06",
  textSecondary: "#4a5058",
  resolvedBg: "#dcfce7",
  dangerLight: "#ecc4bd",
  primaryLightVariant: "#bfe0d9",
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
export const sidebarActiveBg = sidebarColors.sidebarActiveBg;
export const dangerLight = extendedColors.dangerLight;
export const primaryLightVariant = extendedColors.primaryLightVariant;

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
  "4": "6px",
  "8": "12px",
  "13": "20px",
  "18": "27px",
  "24": "36px",
  xs: "8px",
  sm: "12px",
  md: "20px",
  lg: "27px",
  xl: "36px",
  "2": "3px",
  "6": "9px",
  "7": "11px",
  "9": "14px",
  "10": "15px",
  "11": "17px",
  "12": "18px",
  "14": "21px",
  "15": "23px",
  "17": "26px",
  "20": "30px",
  "22": "33px",
  "28": "42px",
  "32": "48px",
  "34": "51px",
  "56": "84px",
  "60": "90px",
  "90": "135px",
} as const;

export const radius = {
  sm: "5px",
  md: "11px",
  lg: "12px",
  pill: "999px",
  card: "12px",
  btn: "8px",
  "1": "1px",
  "2": "2px",
  "3": "3px",
  "4": "4px",
  "6": "6px",
  "7": "7px",
  "8": "8px",
  "9": "9px",
  "10": "10px",
  "12": "12px",
  "14": "14px",
  "16": "16px",
  "34": "34px",
  "44": "44px",
} as const;

export const shadows = {
  buttonPrimary: "0 10px 22px -12px rgba(15,122,107,0.9)",
  fab: "0 10px 20px -8px rgba(15, 122, 107, 0.9)",
  phoneBezel: "0 28px 60px -22px rgba(0, 0, 0, 0.5)",
  browserFrame: "0 24px 60px -30px rgba(0, 0, 0, 0.4)",
  mapLegend: "0 6px 16px -8px rgba(0, 0, 0, 0.3)",
  toggleThumb: "0 1px 2px rgba(0, 0, 0, 0.2)",
  card: "0 24px 60px -30px rgba(0,0,0,0.4)",
} as const;

export interface StatusStyle {
  bg: string;
  fg: string;
  dot: string;
}

export const statusStyle = (status: string): StatusStyle => {
  switch (status) {
    case "perlu_tindakan":
    case "rejected":
    case "ditolak":
      return {
        bg: colors.dangerBg,
        fg: colors.dangerTextStrong,
        dot: colors.danger,
      };

    case "under_review":
    case "submitted":
    case "needs_survey":
    case "needs_completion":
    case "needs_verification":
    case "menunggu":
      return {
        bg: surfaceColors.offlineBg,
        fg: surfaceColors.offlineText,
        dot: surfaceColors.offlineDot,
      };

    case "verified":
    case "terverifikasi":
    case "diterima":
      return {
        bg: colors.primaryLight,
        fg: colors.primaryDark,
        dot: colors.primary,
      };

    case "in_progress":
    case "assigned":
    case "sedang_ditangani":
    case "dalam_proses":
      return { bg: colors.infoBg, fg: "#1d4ed8", dot: colors.info };

    case "resolved":
    case "selesai":
      return {
        bg: colors.primaryLight,
        fg: colors.primaryDark,
        dot: colors.primary,
      };

    default:
      return {
        bg: extendedColors.bgSoft,
        fg: colors.textTertiary,
        dot: colors.textTertiary,
      };
  }
};

export const statusColor = (status: string): string => {
  return statusStyle(status).fg;
};

export const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    closed: "Selesai",
    completed: "Menunggu pemeriksaan hasil",
    pending_clarification: "Menunggu penjelasan",
    accepted: "Petugas menerima tugas",
    submitted: "Menunggu verifikasi",
    under_review: "Sedang Ditinjau",
    verified: "Terverifikasi",
    in_progress: "Sedang Ditangani",
    resolved: "Selesai",
    rejected: "Ditolak",
    duplicate_merged: "Digabung",
    needs_survey: "Perlu pemeriksaan lapangan",
    needs_completion: "Perlu Kelengkapan",
    assigned: "Sedang Ditangani",
    out_of_scope: "Di Luar Cakupan",
    needs_verification: "Menunggu Verifikasi",
    menunggu: "Menunggu Verifikasi",
    dalam_proses: "Sedang Ditangani",
    perlu_tindakan: "Perlu Tindakan",
    diterima: "Terverifikasi",
    ditolak: "Ditolak",
  };
  return labels[status] ?? "Lihat perkembangan laporan";
};

export const caseStatusColors: Record<string, string> = {
  menunggu: "#b8730a",
  dalam_proses: "#2563eb",
  perlu_tindakan: "#c0392b",
  diterima: "#0f7a6b",
  ditolak: "#616770",
};

export const caseStatusLabels: Record<string, string> = {
  menunggu: "Menunggu Verifikasi",
  dalam_proses: "Sedang Ditangani",
  perlu_tindakan: "Perlu Tindakan",
  diterima: "Terverifikasi",
  ditolak: "Ditolak",
};

export const bgPage = "#f9faf8";

export const heatmapGradient = {
  lime: "#84cc16",
  yellow: "#eab308",
  orange: "#f97316",
} as const;

export const assessmentStatusColors = {
  completed: "#0f7a6b",
  timeout: "#b8730a",
  failed: "#c0392b",
  error: "#c0392b",
  default: "#616770",
} as const;
