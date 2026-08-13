import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";
import { logger } from "../lib/logger";
import type { Role } from "../types";

interface AuthUser {
  id: string;
  name: string;
  role: Role;
  wilayah_id?: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  activeRole: Role | null;
  setAuth: (tokens: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }) => void;
  setActiveRole: (role: Role) => void;
  clear: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      activeRole: null,
      setAuth: ({ accessToken, refreshToken, user }) => {
        set({ accessToken, refreshToken, user });
      },
      setActiveRole: (role) => set({ activeRole: role }),
      clear: async () => {
        // Best-effort server-side logout (revoke refresh token).
        // The local clear happens unconditionally — server may be unreachable.
        const rt = get().refreshToken;
        if (rt) {
          try {
            await api.logout();
          } catch (err) {
            logger.error("Logout request failed", { error: err instanceof Error ? err.message : String(err) });
          }
        }
        set({ accessToken: null, refreshToken: null, user: null, activeRole: null });
      },
    }),
    {
      name: "sigap-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        activeRole: state.activeRole,
      }),
    }
  )
);
