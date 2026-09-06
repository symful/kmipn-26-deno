import type { Role, UserRole } from "../types";

export const ROLES: UserRole[] = ["ADMIN", "PETUGAS", "WARGA"];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrator",
  PETUGAS: "Petugas Lapangan",
  WARGA: "Warga",
};

export const ADMIN_ROLES: Role[] = ["ADMIN"];
export const STAFF_ROLES: Role[] = ["ADMIN", "PETUGAS"];
export const ALL_ROLES: Role[] = ["ADMIN", "PETUGAS", "WARGA"];

/**
 * Single source of truth for route → allowed roles.
 * Key is the path segment after /system/ (e.g. "dashboard", "cases").
 * Used by ProtectedRoute for path-based role enforcement.
 */
export const ROUTE_ROLES: Record<string, Role[]> = {
  // ADMIN-only
  users: ADMIN_ROLES,
  categories: ADMIN_ROLES,
  audit: ADMIN_ROLES,
  priority: ADMIN_ROLES,
  settings: ADMIN_ROLES,
  "ai-console": ADMIN_ROLES,
  export: ADMIN_ROLES,
  units: ADMIN_ROLES,
  regional: ADMIN_ROLES,
  "case-review": ADMIN_ROLES,
  analitik: ADMIN_ROLES,

  // ADMIN + PETUGAS
  cases: ADMIN_ROLES,
  tasks: ADMIN_ROLES,
  dashboard: ADMIN_ROLES,
  notifications: ADMIN_ROLES,
};
