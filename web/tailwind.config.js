export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sigap: {
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
        },
      },
      spacing: {
        xs: "5px",
        sm: "8px",
        md: "13px",
        lg: "18px",
        xl: "24px",
      },
      borderRadius: {
        sm: "5px",
        md: "11px",
        lg: "13px",
      },
      fontFamily: {
        sans: "'IBM Plex Sans', system-ui, sans-serif",
        mono: "'IBM Plex Mono', monospace",
      },
    },
  },
  plugins: [],
};
