import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/userflows/**/*.test.ts"],
    globals: true,
    setupFiles: ["./tests/helpers/setup.ts"],
    pool: "forks",
    forks: { singleFork: true },
    testTimeout: 60_000,
    hookTimeout: 60_000,
    passWithNoTests: false,
    // Env vars MUST come from the shell environment (testEnv.ts hard-throws if unset).
    // Do NOT add fallback defaults here — they mask missing config.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
