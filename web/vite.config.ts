import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Vite automatically loads .env files and exposes VITE_ prefixed vars.
  // This explicit define block ensures defaults are available at build time.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    root: ".",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
    server: {
      port: 5173,
      proxy: {},
    },
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(env.VITE_API_BASE_URL || "http://localhost:8787"),
      "import.meta.env.VITE_TILE_URL": JSON.stringify(env.VITE_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
      "import.meta.env.VITE_LOGIN_URL": JSON.stringify(env.VITE_LOGIN_URL || "/admin/login"),
    },
  };
});
