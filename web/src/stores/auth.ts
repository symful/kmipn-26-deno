import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";
import { logger } from "../lib/logger";
import type { Role } from "../types";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled?: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (tokens: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }) => void;
  clear: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: ({ accessToken, refreshToken, user }) => {
        if (
          get().user?.id &&
          get().user?.id !== user.id &&
          "caches" in globalThis
        ) {
          void caches
            .open("sigap-push-context")
            .then((cache) => cache.delete("/__sigap_push_owner"));
        }
        set({ accessToken, refreshToken, user });
      },
      clear: async () => {
        try {
          const { disableBrowserPush } = await import("../lib/browser-push");
          await disableBrowserPush();
        } catch {
          /* Local logout must succeed when delivery services are unavailable. */
        }
        // Best-effort server-side logout (revoke refresh token).
        // The local clear happens unconditionally — server may be unreachable.
        const rt = get().refreshToken;
        if (rt) {
          try {
            await api.logout();
          } catch (err) {
            logger.error("Logout request failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        set({ accessToken: null, refreshToken: null, user: null });
      },
    }),
    {
      name: "sigap-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
