import type {
  GeoJSONFeatureCollection,
  KategoriListResponse,
  LoginRequest,
  LoginResponse,
  PaginatedReports,
  Report,
  AgentAssessRequest,
  AgentAssessResponse,
  AuditLogEntry,
  DashboardStats,
  PaginatedAuditResponse,
  PaginatedOutboxResponse,
  WilayahNode,
  CategoryWithCount,
  SurveyVisit,
  User,
  Notification,
  UnitsResponse,
  PriorityConfig,
  PriorityFormulaVersion,
  PaginatedPriorityVersions,
  PriorityResponse,
  Category,
  PaginatedUsers,
} from "../types";
import { API_BASE } from "../types";
import { useAuthStore } from "../stores/auth";
import { logger } from "../lib/logger";

const getToken = () => localStorage.getItem("access_token");
const getRefreshToken = () => localStorage.getItem("refresh_token");

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}> = [];

function processQueue(token: string | null, err: Error | null = null) {
  refreshQueue.forEach((cb) => {
    if (err) cb.reject(err);
    else cb.resolve(token as string);
  });
  refreshQueue = [];
}

/**
 * Internal token refresh helper - bypasses the main request's 401 interceptor
 * to avoid infinite recursion when refreshing an already-expired token.
 */
async function refreshAccessToken(refreshToken: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    logger.error("Token refresh failed", { status: res.status, statusText: res.statusText });
    throw new Error("Refresh failed");
  }
  return res.json() as Promise<LoginResponse>;
}

/**
 * Performs an HTTP request with automatic auth token handling.
 *
 * Auth Interceptor Pattern:
 * - If `options.token` is true, the request includes a Bearer token in Authorization header
 * - On 401 response with `token: true`, automatically attempts to refresh the access token
 * - After successful refresh, retries the original request with the new token
 * - Refresh failures redirect to login page (VITE_LOGIN_URL)
 * - Uses X-Active-Role header when a role switch is active in the auth store
 *
 * @template T - Expected response type (parsed from JSON)
 * @param path - API path (will be appended to API_BASE)
 * @param options - RequestInit options plus:
 *   - token?: boolean - Whether to include auth token (default: false)
 *   - responseType?: 'json' | 'text' | 'blob' - How to parse response (default: 'json')
 * @returns Promise<T> - Parsed response of the specified type
 */
export async function request<T>(
  path: string,
  options?: RequestInit & { token?: boolean; responseType?: "json" | "text" | "blob" },
): Promise<T> {
  const responseType = options?.responseType ?? "json";

  if (options?.token && !getToken()) {
    throw new Error("Authentication required");
  }

  const passedHeaders = options?.headers as Record<string, string> | undefined;
  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? { ...passedHeaders }
    : { "Content-Type": "application/json", ...passedHeaders };
  if (options?.token && getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }
  const activeRole = useAuthStore.getState().activeRole;
  if (activeRole) {
    headers["X-Active-Role"] = activeRole;
  }

  const makeRequest = async (): Promise<Response> => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  };

  const parseResponse = async (res: Response): Promise<T> => {
    if (!res.ok) {
      let errMsg: string;
      try {
        const err = await res.json().catch(() => null);
        // Handle nested error object: { error: { message: "..." } } or { error: "string" }
        const errObj = err as { error?: { message?: string; code?: string } | string };
        if (typeof errObj?.error === "object" && errObj.error !== null) {
          errMsg = errObj.error.message ?? errObj.error.code ?? res.statusText;
        } else if (typeof errObj?.error === "string") {
          errMsg = errObj.error;
        } else {
          errMsg = res.statusText;
        }
      } catch {
        errMsg = res.statusText;
      }
      logger.error(`API request failed: ${path}`, { status: res.status, error: errMsg });
      const error = new Error(errMsg);
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }
    if (res.status === 204) return {} as T;
    switch (responseType) {
      case "blob":
        return res.blob() as Promise<T>;
      case "text":
        return res.text() as Promise<T>;
      case "json":
      default:
        return res.json() as Promise<T>;
    }
  };

  const res = await makeRequest();

  if (res.status === 401 && options?.token) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          isRefreshing = false;
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = import.meta.env.VITE_LOGIN_URL;
          return Promise.reject(new Error("No refresh token"));
        }
        try {
          const tokens = await refreshAccessToken(refreshToken);
          localStorage.setItem("access_token", tokens.access_token);
          localStorage.setItem("refresh_token", tokens.refresh_token);
          processQueue(tokens.access_token);
        } catch (e) {
          const msg = "Refresh failed: " + (e instanceof Error ? e.message : String(e));
          logger.error(msg, { error: e });
          processQueue(null, new Error(msg));
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = import.meta.env.VITE_LOGIN_URL;
          return Promise.reject(new Error("Session expired"));
        } finally {
          isRefreshing = false;
        }
      }

      const retryResult = await new Promise<T>((resolve, reject) => {
        refreshQueue.push({
          resolve: (token: string) => {
            const retryHeaders = {
              ...headers,
              Authorization: `Bearer ${token}`,
            };
            fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders })
              .then(parseResponse)
              .then(resolve)
              .catch(reject);
          },
          reject,
        });
      });

      // If we got here without a 401, return the result
      return retryResult;
    }
    return Promise.reject(new Error("Max retries exceeded for 401"));
  }

  return parseResponse(res);
}

export const api = {
  login: (body: LoginRequest) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  refresh: (refreshToken: string) =>
    request<LoginResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  authMeData: () =>
    request<{ user: User }>("/auth/me/data", { token: true }),

  geojson: () => request<GeoJSONFeatureCollection>("/public/geojson"),

  publicReport: (id: string) =>
    request<{ id: string; category_id: string; description: string; status: string; severity: number | null; created_at: string; generalized_location: string }>(
      `/public/reports/${id}`
    ),

  categories: () => request<KategoriListResponse>("/categories"),

  wilayah: () => request<{ wilayah: WilayahNode[] }>("/wilayah"),

  reports: (params?: {
    status?: string;
    page?: number;
    wilayah_id?: string;
    priority?: string;
    assigned_unit_id?: string;
    sla?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.wilayah_id) qs.set("wilayah_id", params.wilayah_id);
    if (params?.priority) qs.set("priority", params.priority);
    if (params?.assigned_unit_id) qs.set("assigned_unit_id", params.assigned_unit_id);
    if (params?.sla) qs.set("sla", params.sla);
    const query = qs.toString();
    return request<PaginatedReports>(`/reports${query ? `?${query}` : ""}`, {
      token: true,
    });
  },

  report: (id: string) => request<Report>(`/reports/${id}`, { token: true }),

  reportPriority: (id: string) =>
    request<PriorityResponse>(`/reports/${id}/priority`, { token: true }),

  updateReportPriority: (id: string, body: { override_score: number; override_reason: string }) =>
    request<{ status: string; report_id: string; override_score: number; reports_severity: number; override_reason: string }>(
      `/reports/${id}/priority`,
      { method: "PUT", body: JSON.stringify(body), token: true }
    ),

  updateReport: (id: string, body: { status: string }) =>
    request<Report>(`/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token: true,
    }),

  assess: (body: AgentAssessRequest) =>
    request<AgentAssessResponse>("/agent/assess", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  logout: () =>
    request<{ success: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: localStorage.getItem("refresh_token") }),
    }),

  reportsStats: () => request<DashboardStats>("/reports/stats", { token: true }),

  publicStats: () => request<DashboardStats>("/reports/stats"),

  reportsClose: (id: string) =>
    request<{ status: string }>(`/reports/${id}/close`, {
      method: "POST",
      token: true,
    }),

  reportsAssign: (id: string, body: { assigned_unit_id: string; deadline?: string }) =>
    request<{ status: string }>(`/reports/${id}/assign`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorQueue: (params?: { status?: string; page?: number; limit?: number; kategori?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.kategori) qs.set("kategori", params.kategori);
    const query = qs.toString();
    return request<{
      items: Array<{ id: string; category_id: string; description: string; lng: number; lat: number; status: string; severity: number | null; photo_urls: string[]; created_at: string }>;
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    }>(`/verifikator/queue${query ? `?${query}` : ""}`, { token: true });
  },

  verifikatorCase: (id: string) =>
    request<{ report: Record<string, unknown>; assessments: unknown[]; visits: unknown[]; audit: unknown[] }>(
      `/verifikator/cases/${id}`,
      { token: true }
    ),

  verifikatorAccept: (id: string, body: { reason?: string; assigned_unit_id?: string; deadline?: string; priority?: number }) =>
    request<{ status: string }>(`/verifikator/cases/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorCombine: (id: string, body: { target_case_id: string; reason?: string }) =>
    request<{ status: string }>(`/verifikator/cases/${id}/combine`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorSeparate: (id: string, body: { new_case_description: string; reason?: string }) =>
    request<{ status: string }>(`/verifikator/cases/${id}/separate`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorReject: (id: string, body: { reason: string }) =>
    request<{ status: string }>(`/verifikator/cases/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorDecide: (id: string, body: {
    decision: "valid" | "needs_completion" | "needs_survey" | "duplicate" | "out_of_scope" | "rejected";
    reason?: string;
    duplicate_of_report_id?: string;
    surveyor_id?: string;
    assigned_unit_id?: string;
    deadline?: string;
  }) =>
    request<{ status: string; decision: string; reason?: string }>(`/verifikator/cases/${id}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorVerifyCompletion: (id: string, body: { decision: "approved" | "rejected"; reason?: string; completion_notes?: string }) =>
    request<{ decision: string; report_status: string; reason?: string }>(`/verifikator/cases/${id}/verify-completion`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifikatorReviewSanggahan: (id: string, body: { decision: "accepted" | "rejected"; reason?: string }) =>
    request<{ decision: string; report_status: string; reason?: string }>(`/verifikator/cases/${id}/review-sanggahan`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  reportAssessments: (reportId: string) =>
    request<{ assessments: Array<{
      id: string;
      tool_name: string;
      model_version: string;
      rule_version: string;
      confidence: number;
      supporting_factors: string[];
      risk_factors: string[];
      correlation_ids: string[];
      status: string;
      result: Record<string, unknown>;
      created_at: string;
    }> }>(`/agent/assessments/${reportId}`, { token: true }),

  surveyorTasks: () =>
    request<{ tasks: Array<{ id: string; report_id: string; status: string; instructions: string | null; deadline: string | null }> }>(
      `/surveyor/tasks`,
      { token: true }
    ),

  surveyorTask: (id: string) =>
    request<{ task: {
      id: string;
      report_id: string;
      status: string;
      instructions: string | null;
      deadline: string | null;
      checklist: Array<{ item: string; checked: boolean }>;
    } }>(`/surveyor/tasks/${id}`, { token: true }),

  taskChecklistTemplate: (taskId: string) =>
    request<{ checklist: Array<{ item: string; checked: boolean }> }>(
      `/surveyor/tasks/${taskId}/checklist-template`,
      { token: true }
    ),

  surveyorVisit: (id: string, body: { findings: string; checklist: Array<{ item: string; checked: boolean }>; photo_urls?: string[] }) =>
    request<{ task_id: string; report_id: string; status: string }>(
      `/surveyor/tasks/${id}/visit`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token: true,
      }
    ),

  petugasTasks: (status?: string) =>
    request<{ tasks: Array<{
      id: string;
      report_id: string;
      status: string;
      instructions: string | null;
      deadline: string | null;
      progress_percent: number | null;
      created_at: string;
      updated_at: string;
      report_description: string;
      lng: number;
      lat: number;
      photo_urls: string[];
      severity: number | null;
      report_address: string;
      category_id: string;
      category_name: string;
      category_slug: string;
      unit_name: string;
    }> }>(`/petugas/tasks${status ? `?status=${status}` : ""}`, { token: true }),

  petugasAccept: (id: string, body: { accept: boolean; reason?: string }) =>
    request<{ status: string; accepted: boolean }>(`/petugas/tasks/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  petugasProgress: (id: string, body: { progress_percent: number; notes?: string; estimated_completion?: string }) =>
    request<{ status: string; progress_percent: number; progress_notes: string | null; estimated_completion: string | null }>(
      `/petugas/tasks/${id}/progress`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        token: true,
      }
    ),

  petugasEvidence: (id: string, body: { photo_urls: string[]; notes?: string }) =>
    request<{ evidence_id: string; status: string }>(`/petugas/tasks/${id}/evidence`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  uploadEvidenceFile: (file: File, folder: string, purpose: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    formData.append("purpose", purpose);
    return request<{ url: string }>("/api/upload", {
      method: "POST",
      body: formData,
      token: true,
    });
  },

  petugasComplete: (id: string, body: { summary: string; completion_proof?: string | null }) =>
    request<{ status: string; completed_at: string }>(`/petugas/tasks/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  rtRwVerifyGet: (token: string) =>
    request<{ id: string; [key: string]: unknown }>(`/rt-rw/verify?token=${token}`),

  rtRwVerifyPost: (body: { verification_token: string; report_id: string; verdict: "confirmed" | "rejected"; reason?: string }) =>
    request<{ status: string }>(`/rt-rw/verify`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  auditSearch: (params?: { actor_id?: string; action?: string; report_id?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    request<PaginatedAuditResponse>(
      `/audit/search${
        params
          ? `?${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true }
    ),

  exportAuditCsv: (params?: { actor_id?: string; action?: string; report_id?: string; from?: string; to?: string }) =>
    request<string>(
      `/audit/export?format=csv${
        params
          ? `&${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true, responseType: "text" }
    ),

  exportAuditJson: (params?: { actor_id?: string; action?: string; report_id?: string; from?: string; to?: string }) =>
    request<string>(
      `/audit/export?format=json${
        params
          ? `&${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true, responseType: "text" }
    ),

  exportCsv: (params?: { status?: string; category_id?: string }) =>
    request<string>(
      `/export/csv${
        params
          ? `?${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true, responseType: "text" }
    ),

  exportPdf: (params?: { status?: string; category_id?: string }) =>
    request<Blob>(
      `/export/pdf${
        params
          ? `?${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true, responseType: "blob" }
    ),

  exportGeojson: (params?: { status?: string; category_id?: string; wilayah_id?: string }) =>
    request<Blob>(
      `/export/geojson${
        params
          ? `?${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true, responseType: "blob" }
    ),

  outboxList: (params?: { status?: string; target_system?: string; page?: number; limit?: number }) =>
    request<PaginatedOutboxResponse>(
      `/outbox${
        params
          ? `?${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true }
    ),

  outboxRetry: (id: string) =>
    request<{ status: string; retry_count: number }>(`/outbox/${id}/retry`, {
      method: "POST",
      token: true,
    }),

  outboxDlq: (params?: { page?: number; limit?: number; target_system?: string }) =>
    request<{ items: Array<{ id: string; created_at: string; target_system: string; last_error: string | null; retry_count: number; related_report_id: string | null; next_retry_at: string | null }>; total: number; page: number; limit: number }>(
      `/admin/outbox/dlq${
        params
          ? `?${Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
          : ""
      }`,
      { token: true }
    ),

  outboxStats: () =>
    request<{ stats: Record<string, Record<string, number>> }>(`/admin/outbox/stats`, { token: true }),

  outboxReset: (id: string) =>
    request<{ status: string; retry_count: number; message: string }>(`/admin/outbox/${id}/reset`, {
      method: "POST",
      token: true,
    }),

  outboxReconcile: () =>
    request<{ status: string; reconciled: number; failed: number }>(`/admin/outbox/reconcile`, {
      method: "POST",
      token: true,
    }),

  outboxDlqReconcile: () =>
    request<{ status: string; reconciled: number; details: { stuck_pending_reset: number; retryable_failed_reset: number } }>(`/outbox/dlq/reconcile`, {
      method: "POST",
      token: true,
    }),

  createReportPublic: (body: {
    category_id: string;
    description: string;
    lat: number;
    lng: number;
    photo_urls?: string[];
    idempotency_key: string;
    device_id: string;
  }) =>
    request<{ id: string; duplicate: boolean }>("/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  photoUploadUrl: (reportId: string, contentType: string) =>
    request<{ key: string; public_url: string; upload_url: string; method: string }>(
      `/reports/${reportId}/photos/upload-url`,
      { method: "POST", body: JSON.stringify({ content_type: contentType }), token: true }
    ),

  surveyorPhotoUpload: (reportId: string, contentType: string, fileBase64: string) =>
    request<{ public_url: string }>(
      `/reports/${reportId}/photos/upload-url`,
      { method: "POST", body: JSON.stringify({ content_type: contentType, file: fileBase64 }), token: true }
    ),

  adminRegisterVerifikator: (body: { email: string; password: string; name: string }) =>
    request<{ id: string; email: string; role: string }>("/auth/register-verifikator", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  notifications: () =>
    request<{ entries: Array<{
      id: string;
      user_id: string | null;
      kind: string;
      title: string;
      body: string;
      related_report_id: string | null;
      read_at: string | null;
      created_at: string;
    }> }>("/notifications", { token: true }),

  markNotificationRead: (id: string) =>
    request<{ success: boolean; updated: number }>("/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify({ id }),
      token: true,
    }),

  markAllNotificationsRead: () =>
    request<{ success: boolean; updated: string }>("/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify({ mark_all: true }),
      token: true,
    }),

  units: () => request<UnitsResponse>("/admin/units", { token: true }),

  createWilayah: (body: { parent_id: string | null; name: string; code: string; level: string }) =>
    request<WilayahNode>("/wilayah", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  updateWilayah: (id: string, body: { parent_id?: string | null; name?: string; code?: string; level?: string }) =>
    request<WilayahNode>(`/wilayah/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token: true,
    }),

  deleteWilayah: (id: string) =>
    request<{ success: boolean }>(`/wilayah/${id}`, {
      method: "DELETE",
      token: true,
    }),

  wilayahAudit: (wilayahId: string) =>
    request<{ entries: Array<{
      id: string;
      actor: string | null;
      action: string;
      object_type: string;
      object_id: string | null;
      before: unknown;
      after: unknown;
      created_at: string;
    }> }>(`/audit/search?report_id=${wilayahId}&action=wilayah_update`, { token: true }),

  generateRtRwToken: (body: { report_id: string; rt_rw_user_id: string }) =>
    request<{ magic_link: string }>("/admin/generate-rt-rw-token", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  priorityConfig: () =>
    request<PriorityConfig>("/admin/priority-config", { token: true }),

  updatePriorityConfig: (weights: {
    severity: number;
    affected_residents: number;
    region_vulnerability: number;
    sla_pressure: number;
  }) =>
    request<PriorityConfig>("/admin/priority-config", {
      method: "PATCH",
      body: JSON.stringify(weights),
      token: true,
    }),

  getPriorityConfigVersions: (page = 1, limit = 20) =>
    request<PaginatedPriorityVersions>(`/admin/priority-config?page=${page}&limit=${limit}`, { token: true }),

  getPriorityConfigVersion: (version: number) =>
    request<PriorityFormulaVersion>(`/admin/priority-config/${version}`, { token: true }),

  createPriorityConfigVersion: (weights: {
    severity: number;
    impact: number;
    vulnerability: number;
    sla: number;
  }) =>
    request<PriorityFormulaVersion>("/admin/priority-config", {
      method: "POST",
      body: JSON.stringify({ weights }),
      token: true,
    }),

  updatePriorityConfigVersion: (version: number, weights: {
    severity: number;
    impact: number;
    vulnerability: number;
    sla: number;
  }) =>
    request<PriorityFormulaVersion>(`/admin/priority-config/${version}`, {
      method: "PATCH",
      body: JSON.stringify({ weights }),
      token: true,
    }),

  activatePriorityConfigVersion: (version: number) =>
    request<PriorityFormulaVersion>(`/admin/priority-config/${version}/activate`, {
      method: "POST",
      token: true,
    }),

  createCategory: (body: { name: string; slug: string; icon?: string; description?: string; parent_id?: string | null }) =>
    request<Category>("/categories", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  updateCategory: (id: string, body: { name?: string; slug?: string; icon?: string; description?: string; parent_id?: string | null }) =>
    request<Category>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token: true,
    }),

  deleteCategory: (id: string) =>
    request<void>(`/categories/${id}`, {
      method: "DELETE",
      token: true,
    }),

  users: (params?: { page?: number; limit?: number; role?: string; wilayah_id?: string; is_active?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.role) qs.set("role", params.role);
    if (params?.wilayah_id) qs.set("wilayah_id", params.wilayah_id);
    if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
    const query = qs.toString();
    return request<PaginatedUsers>(`/admin/users${query ? `?${query}` : ""}`, { token: true });
  },

  createUser: (body: { email: string; password: string; name: string; role: string; wilayah_id?: string | null }) =>
    request<{ id: string; email: string; name: string; role: string; wilayah_id: string | null }>(`/admin/users`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  updateUser: (id: string, body: { role?: string; disabled?: boolean }) =>
    request<{ id: string; email: string; name: string; role: string; disabled: boolean }>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token: true,
    }),

  deactivateUser: (id: string) =>
    request<{ message: string }>(`/admin/users/${id}/deactivate`, {
      method: "PATCH",
      token: true,
    }),

  reactivateUser: (id: string) =>
    request<{ message: string }>(`/admin/users/${id}/reactivate`, {
      method: "PATCH",
      token: true,
    }),

  deleteUser: (id: string) =>
    request<{ message: string }>(`/admin/users/${id}`, {
      method: "DELETE",
      token: true,
    }),

  userAudit: (userId: string, params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params?.limit));
    qs.set("object_id", userId);
    const query = qs.toString();
    return request<PaginatedAuditResponse>(`/audit/search?${query}`, { token: true });
  },

  auditVerifyChain: () =>
    request<{ ok: boolean; count: number; first_break_at?: number }>("/audit/verify-chain", {
      token: true,
    }),

  auditorStats: () =>
    request<{
      counts: { total: number; last_24h: number; last_7d: number; last_30d: number };
      top_actors: Array<{ actor: string; action_count: number }>;
      failed_attempts: number;
      recent_suspicious: Array<{
        id: string;
        actor: string;
        action: string;
        object_type: string;
        object_id: string;
        created_at: string;
      }>;
    }>("/auditor/stats", { token: true }),

  shareReportFilter: (params: {
    filters: Record<string, string | string[]>;
    expires_at?: string;
  }) =>
    request<{ share_url: string; expires_at: string }>("/reports/share-filter", {
      method: "POST",
      body: JSON.stringify(params),
      token: true,
    }),
};
