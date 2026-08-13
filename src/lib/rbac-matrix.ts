/**
 * RBAC Matrix — Single Source of Truth for Role × Endpoint Authorization.
 *
 * This module defines which roles can access which API endpoints.
 * It complements the wilayah scoping in @/lib/rbac (applyWilayahFilter).
 *
 * Usage:
 *   import { RBAC_MATRIX, requireRoleFromMatrix } from "@/lib/rbac-matrix";
 *
 * For dynamic route matching, use `requireRoleFromMatrix(path, method, user.role)`.
 */

import type { MiddlewareHandler } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";

export type Role =
  | "ADMIN"
  | "VERIFIKATOR"
  | "SURVEYOR"
  | "OPERATOR"
  | "RT_RW"
  | "PETUGAS"
  | "ADMIN_DAERAH"
  | "AUDITOR"
  | "PENGAMBIL_KEPUTUSAN"
  | "PUBLIC"
  | "SYSTEM";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Minimal endpoint permission descriptor */
export interface EndpointPermission {
  method: HttpMethod;
  /** Glob-style path pattern: e.g. "/api/reports/*" or "/api/reports/:id" */
  pathPattern: string;
  /** Roles allowed to access this endpoint */
  allowedRoles: Role[];
  /** Whether authentication is required (true for all internal endpoints) */
  authRequired: boolean;
  /** Optional: if true, apply wilayah scoping for ADMIN_DAERAH */
  scopeByWilayah?: boolean;
}

/**
 * Complete RBAC matrix for all API endpoints.
 *
 * Format: `${METHOD} ${pathPattern}` → permission descriptor.
 *
 * Conventions:
 * - All authenticated endpoints require authRequired: true
 * - Public endpoints (no auth) have allowedRoles: ["PUBLIC"] and authRequired: false
 * - scopeByWilayah: true endpoints restrict ADMIN_DAERAH to their wilayah_id
 */
export const RBAC_MATRIX: Record<string, EndpointPermission> = {
  // ─── Auth ───────────────────────────────────────────────────────────────────
  "POST /api/auth/login": {
    method: "POST",
    pathPattern: "/api/auth/login",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "POST /api/auth/refresh": {
    method: "POST",
    pathPattern: "/api/auth/refresh",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "POST /api/auth/logout": {
    method: "POST",
    pathPattern: "/api/auth/logout",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "RT_RW", "PETUGAS", "ADMIN_DAERAH", "AUDITOR", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
  },
  "POST /api/auth/register-verifikator": {
    method: "POST",
    pathPattern: "/api/auth/register-verifikator",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },

  // ─── Reports ───────────────────────────────────────────────────────────────
  "GET /api/reports": {
    method: "GET",
    pathPattern: "/api/reports",
    allowedRoles: ["ADMIN", "OPERATOR", "VERIFIKATOR", "SURVEYOR", "PETUGAS", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/reports": {
    method: "POST",
    pathPattern: "/api/reports",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "PETUGAS", "ADMIN_DAERAH"],
    authRequired: true,
  },
  "GET /api/reports/stats": {
    method: "GET",
    pathPattern: "/api/reports/stats",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/reports/heatmap": {
    method: "GET",
    pathPattern: "/api/reports/heatmap",
    allowedRoles: ["ADMIN", "OPERATOR", "VERIFIKATOR", "PENGAMBIL_KEPUTUSAN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/reports/:id": {
    method: "GET",
    pathPattern: "/api/reports/:id",
    allowedRoles: ["ADMIN", "OPERATOR", "VERIFIKATOR", "SURVEYOR", "PETUGAS", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/reports/:id/assign": {
    method: "POST",
    pathPattern: "/api/reports/:id/assign",
    allowedRoles: ["ADMIN", "OPERATOR"],
    authRequired: true,
  },
  "POST /api/reports/:id/resolve": {
    method: "POST",
    pathPattern: "/api/reports/:id/resolve",
    allowedRoles: ["ADMIN", "OPERATOR", "PETUGAS"],
    authRequired: true,
  },
  "POST /api/reports/:id/close": {
    method: "POST",
    pathPattern: "/api/reports/:id/close",
    allowedRoles: ["ADMIN", "OPERATOR"],
    authRequired: true,
  },
  "POST /api/reports/:id/escalate": {
    method: "POST",
    pathPattern: "/api/reports/:id/escalate",
    allowedRoles: ["ADMIN", "OPERATOR", "PETUGAS"],
    authRequired: true,
  },
  "GET /api/reports/:id/priority": {
    method: "GET",
    pathPattern: "/api/reports/:id/priority",
    allowedRoles: ["ADMIN", "OPERATOR", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/reports/:id/share": {
    method: "GET",
    pathPattern: "/api/reports/:id/share",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "ADMIN_DAERAH"],
    authRequired: true,
  },

  // ─── Photos ────────────────────────────────────────────────────────────────
  "POST /api/reports/photos/upload-url": {
    method: "POST",
    pathPattern: "/api/reports/photos/upload-url",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "PETUGAS", "ADMIN_DAERAH"],
    authRequired: true,
  },

  // ─── Sync ──────────────────────────────────────────────────────────────────
  "POST /api/sync/batch": {
    method: "POST",
    pathPattern: "/api/sync/batch",
    allowedRoles: ["SURVEYOR", "PETUGAS"],
    authRequired: true,
  },

  // ─── Export ────────────────────────────────────────────────────────────────
  "GET /api/export/geojson": {
    method: "GET",
    pathPattern: "/api/export/geojson",
    allowedRoles: ["ADMIN", "OPERATOR", "PENGAMBIL_KEPUTUSAN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/export/csv": {
    method: "GET",
    pathPattern: "/api/export/csv",
    allowedRoles: ["ADMIN", "OPERATOR", "PENGAMBIL_KEPUTUSAN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },

  // ─── Public (rate-limited, no auth) ───────────────────────────────────────
  "GET /api/public/reports": {
    method: "GET",
    pathPattern: "/api/public/reports",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "GET /api/public/reports/:id": {
    method: "GET",
    pathPattern: "/api/public/reports/:id",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "POST /api/public/reports": {
    method: "POST",
    pathPattern: "/api/public/reports",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "GET /api/public/geojson": {
    method: "GET",
    pathPattern: "/api/public/geojson",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "POST /api/public/sync-batch": {
    method: "POST",
    pathPattern: "/api/public/sync-batch",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "POST /api/public/sync-kpi": {
    method: "POST",
    pathPattern: "/api/public/sync-kpi",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },

  // ─── RT/RW ────────────────────────────────────────────────────────────────
  "GET /api/rt-rw/verify": {
    method: "GET",
    pathPattern: "/api/rt-rw/verify",
    allowedRoles: ["RT_RW"],
    authRequired: true,
  },
  "POST /api/rt-rw/verify": {
    method: "POST",
    pathPattern: "/api/rt-rw/verify",
    allowedRoles: ["RT_RW"],
    authRequired: true,
  },
  "POST /api/admin/generate-rt-rw-token": {
    method: "POST",
    pathPattern: "/api/admin/generate-rt-rw-token",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
  },

  // ─── Verifikator ──────────────────────────────────────────────────────────
  "GET /api/verifikator/queue": {
    method: "GET",
    pathPattern: "/api/verifikator/queue",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/verifikator/cases/:id": {
    method: "GET",
    pathPattern: "/api/verifikator/cases/:id",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/verifikator/cases/:id/accept": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/accept",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },
  "POST /api/verifikator/cases/:id/reject": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/reject",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },
  "POST /api/verifikator/cases/:id/combine": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/combine",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },
  "POST /api/verifikator/cases/:id/separate": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/separate",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },
  "POST /api/verifikator/cases/:id/decide": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/decide",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },
  "POST /api/verifikator/cases/:id/review-sanggahan": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/review-sanggahan",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },
  "POST /api/verifikator/cases/:id/verify-completion": {
    method: "POST",
    pathPattern: "/api/verifikator/cases/:id/verify-completion",
    allowedRoles: ["VERIFIKATOR"],
    authRequired: true,
  },

  // ─── Surveyor ─────────────────────────────────────────────────────────────
  "GET /api/surveyor/tasks": {
    method: "GET",
    pathPattern: "/api/surveyor/tasks",
    allowedRoles: ["SURVEYOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/surveyor/tasks/:id": {
    method: "GET",
    pathPattern: "/api/surveyor/tasks/:id",
    allowedRoles: ["SURVEYOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/surveyor/tasks/:id/visit": {
    method: "POST",
    pathPattern: "/api/surveyor/tasks/:id/visit",
    allowedRoles: ["SURVEYOR"],
    authRequired: true,
  },

  // ─── Petugas ───────────────────────────────────────────────────────────────
  "GET /api/petugas/tasks": {
    method: "GET",
    pathPattern: "/api/petugas/tasks",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/petugas/tasks/:id": {
    method: "GET",
    pathPattern: "/api/petugas/tasks/:id",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/petugas/tasks/:id/accept": {
    method: "POST",
    pathPattern: "/api/petugas/tasks/:id/accept",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
  },
  "PATCH /api/petugas/tasks/:id/progress": {
    method: "PATCH",
    pathPattern: "/api/petugas/tasks/:id/progress",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
  },
  "POST /api/petugas/tasks/:id/evidence": {
    method: "POST",
    pathPattern: "/api/petugas/tasks/:id/evidence",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
  },
  "POST /api/petugas/tasks/:id/complete": {
    method: "POST",
    pathPattern: "/api/petugas/tasks/:id/complete",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
  },
  "POST /api/petugas/tasks/:id/clarification": {
    method: "POST",
    pathPattern: "/api/petugas/tasks/:id/clarification",
    allowedRoles: ["PETUGAS"],
    authRequired: true,
  },

  // ─── Operator ──────────────────────────────────────────────────────────────
  "GET /api/operator": {
    method: "GET",
    pathPattern: "/api/operator",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/operator/stats": {
    method: "GET",
    pathPattern: "/api/operator/stats",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/operator/cases/:id/merge": {
    method: "POST",
    pathPattern: "/api/operator/cases/:id/merge",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
  },
  "POST /api/operator/cases/:id/separate": {
    method: "POST",
    pathPattern: "/api/operator/cases/:id/separate",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
  },
  "POST /api/operator/cases/:id/priority": {
    method: "POST",
    pathPattern: "/api/operator/cases/:id/priority",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
  },
  "POST /api/operator/cases/:id/assign": {
    method: "POST",
    pathPattern: "/api/operator/cases/:id/assign",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
  },
  "POST /api/operator/cases/:id/escalate": {
    method: "POST",
    pathPattern: "/api/operator/cases/:id/escalate",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
  },
  "PATCH /api/operator/cases/:id/sla": {
    method: "PATCH",
    pathPattern: "/api/operator/cases/:id/sla",
    allowedRoles: ["OPERATOR"],
    authRequired: true,
  },

  // ─── Admin ────────────────────────────────────────────────────────────────
  "GET /api/admin/users": {
    method: "GET",
    pathPattern: "/api/admin/users",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "POST /api/admin/users": {
    method: "POST",
    pathPattern: "/api/admin/users",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "PATCH /api/admin/users/:id": {
    method: "PATCH",
    pathPattern: "/api/admin/users/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "DELETE /api/admin/users/:id": {
    method: "DELETE",
    pathPattern: "/api/admin/users/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "GET /api/admin/units": {
    method: "GET",
    pathPattern: "/api/admin/units",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/admin/units": {
    method: "POST",
    pathPattern: "/api/admin/units",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "PATCH /api/admin/units/:id": {
    method: "PATCH",
    pathPattern: "/api/admin/units/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "DELETE /api/admin/units/:id": {
    method: "DELETE",
    pathPattern: "/api/admin/units/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "GET /api/admin/priority-config": {
    method: "GET",
    pathPattern: "/api/admin/priority-config",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
  },
  "POST /api/admin/priority-config": {
    method: "POST",
    pathPattern: "/api/admin/priority-config",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "PATCH /api/admin/priority-config/:version": {
    method: "PATCH",
    pathPattern: "/api/admin/priority-config/:version",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "POST /api/admin/priority-config/:version/activate": {
    method: "POST",
    pathPattern: "/api/admin/priority-config/:version/activate",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "GET /api/admin/sync-kpi": {
    method: "GET",
    pathPattern: "/api/admin/sync-kpi",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin/outbox": {
    method: "GET",
    pathPattern: "/api/admin/outbox",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/admin/outbox/:id/retry": {
    method: "POST",
    pathPattern: "/api/admin/outbox/:id/retry",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
  },
  "GET /api/admin/kpis/adoption-rate": {
    method: "GET",
    pathPattern: "/api/admin/kpis/adoption-rate",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin/kpis/verification-duration": {
    method: "GET",
    pathPattern: "/api/admin/kpis/verification-duration",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin/kpis/sync-success": {
    method: "GET",
    pathPattern: "/api/admin/kpis/sync-success",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },

  // ─── Admin Daerah ─────────────────────────────────────────────────────────
  "GET /api/admin-daerah/dashboard": {
    method: "GET",
    pathPattern: "/api/admin-daerah/dashboard",
    allowedRoles: ["ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin-daerah/cases": {
    method: "GET",
    pathPattern: "/api/admin-daerah/cases",
    allowedRoles: ["ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin-daerah/operators": {
    method: "GET",
    pathPattern: "/api/admin-daerah/operators",
    allowedRoles: ["ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin-daerah/petugas": {
    method: "GET",
    pathPattern: "/api/admin-daerah/petugas",
    allowedRoles: ["ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/admin-daerah/stats": {
    method: "GET",
    pathPattern: "/api/admin-daerah/stats",
    allowedRoles: ["ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },

  // ─── Auditor ──────────────────────────────────────────────────────────────
  "GET /api/auditor/audit-search": {
    method: "GET",
    pathPattern: "/api/auditor/audit-search",
    allowedRoles: ["AUDITOR"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/auditor/audit-export": {
    method: "GET",
    pathPattern: "/api/auditor/audit-export",
    allowedRoles: ["AUDITOR"],
    authRequired: true,
  },
  "GET /api/auditor/system-logs": {
    method: "GET",
    pathPattern: "/api/auditor/system-logs",
    allowedRoles: ["AUDITOR"],
    authRequired: true,
  },

  // ─── Audit ────────────────────────────────────────────────────────────────
  "GET /api/audit/search": {
    method: "GET",
    pathPattern: "/api/audit/search",
    allowedRoles: ["ADMIN", "AUDITOR", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/audit/export": {
    method: "GET",
    pathPattern: "/api/audit/export",
    allowedRoles: ["ADMIN", "AUDITOR"],
    authRequired: true,
  },
  "GET /api/audit/verify-chain": {
    method: "GET",
    pathPattern: "/api/audit/verify-chain",
    allowedRoles: ["ADMIN", "AUDITOR"],
    authRequired: true,
  },

  // ─── Agent ────────────────────────────────────────────────────────────────
  "POST /api/agent/assess": {
    method: "POST",
    pathPattern: "/api/agent/assess",
    allowedRoles: ["ADMIN", "SYSTEM"],
    authRequired: true,
  },

  // ─── Outbox ───────────────────────────────────────────────────────────────
  "GET /api/outbox": {
    method: "GET",
    pathPattern: "/api/outbox",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "POST /api/outbox/process": {
    method: "POST",
    pathPattern: "/api/outbox/process",
    allowedRoles: ["ADMIN", "SYSTEM"],
    authRequired: true,
  },
  "POST /api/outbox/:id/retry": {
    method: "POST",
    pathPattern: "/api/outbox/:id/retry",
    allowedRoles: ["ADMIN", "ADMIN_DAERAH"],
    authRequired: true,
  },

  // ─── Categories & Wilayah ─────────────────────────────────────────────────
  "GET /api/categories": {
    method: "GET",
    pathPattern: "/api/categories",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "PETUGAS", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
  },
  "POST /api/categories": {
    method: "POST",
    pathPattern: "/api/categories",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "PATCH /api/categories/:id": {
    method: "PATCH",
    pathPattern: "/api/categories/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "DELETE /api/categories/:id": {
    method: "DELETE",
    pathPattern: "/api/categories/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "GET /api/wilayah": {
    method: "GET",
    pathPattern: "/api/wilayah",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "PETUGAS", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
  },
  "POST /api/wilayah": {
    method: "POST",
    pathPattern: "/api/wilayah",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "PATCH /api/wilayah/:id": {
    method: "PATCH",
    pathPattern: "/api/wilayah/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },
  "DELETE /api/wilayah/:id": {
    method: "DELETE",
    pathPattern: "/api/wilayah/:id",
    allowedRoles: ["ADMIN"],
    authRequired: true,
  },

  // ─── Executive ────────────────────────────────────────────────────────────
  "GET /api/executive/dashboard": {
    method: "GET",
    pathPattern: "/api/executive/dashboard",
    allowedRoles: ["PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/executive/regional-stats": {
    method: "GET",
    pathPattern: "/api/executive/regional-stats",
    allowedRoles: ["PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },
  "GET /api/executive/trend-analysis": {
    method: "GET",
    pathPattern: "/api/executive/trend-analysis",
    allowedRoles: ["PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
    scopeByWilayah: true,
  },

  // ─── Notifications ────────────────────────────────────────────────────────
  "GET /api/notifications": {
    method: "GET",
    pathPattern: "/api/notifications",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "PETUGAS", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
  },
  "POST /api/notifications/mark-read": {
    method: "POST",
    pathPattern: "/api/notifications/mark-read",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "PETUGAS", "ADMIN_DAERAH", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
  },

  // ─── Me ───────────────────────────────────────────────────────────────────
  "GET /api/me/data": {
    method: "GET",
    pathPattern: "/api/me/data",
    allowedRoles: ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "RT_RW", "PETUGAS", "ADMIN_DAERAH", "AUDITOR", "PENGAMBIL_KEPUTUSAN"],
    authRequired: true,
  },

  // ─── Webhook ──────────────────────────────────────────────────────────────
  "POST /api/webhooks/inbound": {
    method: "POST",
    pathPattern: "/api/webhooks/inbound",
    allowedRoles: ["SYSTEM"],
    authRequired: false,
  },

  // ─── Health & Errors ──────────────────────────────────────────────────────
  "GET /api/health": {
    method: "GET",
    pathPattern: "/api/health",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
  "POST /api/client-errors": {
    method: "POST",
    pathPattern: "/api/client-errors",
    allowedRoles: ["PUBLIC"],
    authRequired: false,
  },
};

/**
 * Convert a glob-style path pattern to a regex.
 * Supports: * (wildcard), ** (any depth), :param (named param).
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/:[^/]+/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/**
 * Find the matching permission entry for a given HTTP method and URL path.
 */
export function matchPermission(
  method: HttpMethod,
  path: string,
): EndpointPermission | null {
  for (const key of Object.keys(RBAC_MATRIX)) {
    const perm = RBAC_MATRIX[key]!;
    if (perm.method !== method) continue;
    if (patternToRegex(perm.pathPattern).test(path)) {
      return perm;
    }
  }
  return null;
}

/**
 * Check if a role is allowed to access an endpoint.
 */
export function isRoleAllowed(role: Role, permission: EndpointPermission): boolean {
  return permission.allowedRoles.includes(role) || permission.allowedRoles.includes("PUBLIC" as Role);
}

/**
 * Middleware factory: creates a requireRole check based on the RBAC matrix.
 * This allows routes to use matrix-driven authorization dynamically.
 *
 * Note: Routes that need static requireRole use the middleware directly.
 * This function is useful for routes that want matrix-driven checks.
 */
export function requireRoleFromMatrix(
  allowedRoles?: Role[],
): MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (allowedRoles && allowedRoles.length > 0) {
      // Static override — use the provided roles directly
      const role = user.role as Role;
      if (!allowedRoles.includes(role)) {
        return c.json({ error: "forbidden", required_roles: allowedRoles }, 403);
      }
    } else {
      // Dynamic lookup in the RBAC matrix
      const method = c.req.method as HttpMethod;
      const path = c.req.path;
      const permission = matchPermission(method, path);

      if (!permission) {
        // No entry in matrix — deny by default
        return c.json({ error: "forbidden", reason: "route_not_in_rbac_matrix" }, 403);
      }

      if (permission.authRequired === false) {
        // Public endpoint — skip auth check
        return await next();
      }

      const role = user.role as Role;
      if (!isRoleAllowed(role, permission)) {
        return c.json({ error: "forbidden", required_roles: permission.allowedRoles }, 403);
      }
    }

    return await next();
  };
}

/**
 * Rate limit config for public endpoints (no auth).
 * Returns limit and windowMs for a given path.
 */
export function publicRateLimitConfig(path: string): { limit: number; windowMs: number } | null {
  if (path.startsWith("/api/public/")) {
    // 60 req/min per IP for public endpoints
    return { limit: 60, windowMs: 60 * 1000 };
  }
  return null;
}

/**
 * Rate limit config for rt-rw/verify GET endpoint.
 * 10 req/min per token.
 */
export function rtRwVerifyRateLimitConfig(path: string, method: HttpMethod): { limit: number; windowMs: number } | null {
  if (path === "/api/rt-rw/verify" && method === "GET") {
    return { limit: 10, windowMs: 60 * 1000 };
  }
  return null;
}
