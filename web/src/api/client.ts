import type { TaskListResponse } from "./task-types";
import type {
  GeoJSONFeatureCollection,
  KategoriListResponse,
  LoginRequest,
  LoginResponse,
  PaginatedReports,
  Report,
  ReportStatus,
  AgentAssessRequest,
  AgentAssessResponse,
  AuditLogEntry,
  DashboardStats,
  PublicStats,
  PaginatedAuditResponse,
  SurveyVisit,
  User,
  Notification,
  PriorityFormulaVersion,
  PaginatedPriorityVersions,
  PriorityResponse,
  Category,
  PaginatedUsers,
  FacilityCluster,
  QueueCounts,
  ExecutiveDashboard,
  RegionalStats,
  TrendData,
  HeatmapData,
  NearbyReports,
  Duplicates,
  AdminDashboard,
  Cases,
  AdminUsers,
  Petugas,
  SlaRulesResponse,
  Geocode,
  PublicReportsResponse,
  SyncQuality,
  Facility,
  AgentAssessment,
  StoredAgentAssessment,
} from "../types";
import { API_BASE } from "../types";
import { useAuthStore } from "../stores/auth";
import { logger } from "../lib/logger";
import type {
  IntegrationsResponse,
  PublicReportDetail,
} from "../types/governance";

const getToken = () => useAuthStore.getState().accessToken;
const getRefreshToken = () => useAuthStore.getState().refreshToken;

let refreshPromise: Promise<LoginResponse> | null = null;

/**
 * Internal token refresh helper - bypasses the main request's 401 interceptor
 * to avoid infinite recursion when refreshing an already-expired token.
 */
async function refreshAccessToken(
  refreshToken: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    logger.warn("Token refresh failed", {
      status: res.status,
      statusText: res.statusText,
    });
    throw new Error(
      "Aplikasi belum dapat memperbarui sesi. Masuk kembali untuk melanjutkan.",
    );
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
  options?: RequestInit & {
    token?: boolean;
    responseType?: "json" | "text" | "blob";
  },
): Promise<T> {
  const responseType = options?.responseType ?? "json";

  if (options?.token && !getToken()) {
    const err = new Error("Authentication required") as Error & {
      status: number;
    };
    err.status = 401;
    throw err;
  }

  const passedHeaders = options?.headers as Record<string, string> | undefined;
  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? { ...passedHeaders }
    : { "Content-Type": "application/json", ...passedHeaders };
  if (options?.token && getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`;
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
        const errObj = err as {
          error?: { message?: string; code?: string } | string;
        };
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
      if (res.status >= 500 && path !== "/client-errors") {
        logger.error(`API request failed: ${path}`, {
          status: res.status,
          error: errMsg,
        });
      } else {
        logger.warn(`API request rejected: ${path}`, {
          status: res.status,
          error: errMsg,
        });
      }
      const genericMessages: Record<number, string> = {
        400: "Periksa isian formulir dan lengkapi informasi yang diminta sebelum mencoba lagi.",
        401: "Masuk kembali agar aplikasi dapat melanjutkan permintaan dengan akun Anda.",
        403: "Akun Anda tidak memiliki akses untuk tindakan ini. Hubungi administrator bila tugas Anda memerlukan akses tersebut.",
        404: "Aplikasi tidak menemukan data yang Anda buka. Kembali ke daftar dan pilih catatan yang masih tersedia.",
        409: "Data telah berubah atau masih memiliki kaitan yang menghalangi tindakan ini. Muat ulang catatan dan periksa status terbarunya.",
        429: "Layanan menerima terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi.",
        500: "Layanan mengalami kendala. Coba lagi setelah beberapa saat; periksa hasil terakhir sebelum mengulang pengiriman.",
        503: "Layanan ini belum dapat menerima permintaan. Coba lagi setelah beberapa saat.",
      };
      const generic =
        errMsg === res.statusText ||
        /^[A-Z][A-Z_]+$/.test(errMsg) ||
        [
          "Resource not found",
          "Unauthorized",
          "Forbidden",
          "Internal server error",
        ].includes(errMsg);
      const error = new Error(
        generic
          ? (genericMessages[res.status] ??
              "Aplikasi belum dapat menyelesaikan permintaan. Coba muat ulang halaman dan periksa hasil terakhir.")
          : errMsg,
      );
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
    const sentToken = headers.Authorization?.replace(/^Bearer /, "");
    const clearRejectedSession = () => {
      useAuthStore.setState({
        accessToken: null,
        refreshToken: null,
        user: null,
      });
    };
    let token = getToken();
    // A concurrent request may already have rotated the token while this old request was in flight.
    if (token === sentToken) {
      try {
        if (!refreshPromise) {
          const refreshToken = getRefreshToken();
          if (!refreshToken)
            throw new Error(
              "Masuk kembali agar aplikasi dapat melanjutkan permintaan dengan akun Anda.",
            );
          refreshPromise = refreshAccessToken(refreshToken)
            .then((tokens) => {
              // Do not resurrect an account that signed out or changed during refresh.
              if (getRefreshToken() !== refreshToken)
                throw new Error(
                  "Akun pada sesi ini berubah. Muat ulang halaman sebelum melanjutkan.",
                );
              useAuthStore.setState({
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
              });
              return tokens;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        token = (await refreshPromise).access_token;
      } catch (error) {
        if (getToken() === sentToken) clearRejectedSession();
        throw error;
      }
    }
    if (!token)
      throw Object.assign(
        new Error(
          "Masuk kembali agar aplikasi dapat melanjutkan permintaan dengan akun Anda.",
        ),
        { status: 401 },
      );
    const retry = await fetch(API_BASE + path, {
      ...options,
      headers: { ...headers, Authorization: "Bearer " + token },
    });
    if (retry.status === 401 && getToken() === token) clearRejectedSession();
    return parseResponse(retry);
  }

  return parseResponse(res);
}

export const api = {
  integrations: () =>
    request<IntegrationsResponse>("/admin/integrations", { token: true }),
  syncIntegrations: () =>
    request<never>("/admin/integrations/sync", { method: "POST", token: true }),
  login: async (body: LoginRequest) => {
    return await request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  refresh: (refreshToken: string) =>
    request<LoginResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  authMeData: () => request<User>("/auth/me", { token: true }),
  categoryChecklist: (id: string) =>
    request<import("./checklist-types").CategoryChecklistTemplate>(
      `/categories/${id}/checklist-template`,
      { token: true },
    ),
  saveCategoryChecklist: (
    id: string,
    items: import("./checklist-types").CategoryChecklistItem[],
  ) =>
    request<import("./checklist-types").CategoryChecklistTemplate>(
      `/categories/${id}/checklist-template`,
      { token: true, method: "PUT", body: JSON.stringify({ items }) },
    ),

  geojson: (params?: { period?: string }) => {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    const query = qs.toString();
    return request<GeoJSONFeatureCollection>(
      `/public/geojson${query ? `?${query}` : ""}`,
    );
  },

  publicReport: (id: string) =>
    request<PublicReportDetail>(`/public/reports/${id}`),

  publicCategories: async () => {
    const res = await request<{ data: Category[] }>("/public/categories");
    return res.data ?? [];
  },

  publicAnonymousReport: (data: {
    address_area?: string;
    title?: string;
    kelurahan?: string;
    category_id: string;
    description: string;
    lat: number;
    lng: number;
    photos?: string[];
    idempotency_key: string;
    device_id: string;
    population_affected?: number;
    vulnerability_index?: number;
  }) =>
    request<{ id: string; status: string }>("/public/anonymous-reports", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  categories: () =>
    request<KategoriListResponse>("/categories", { token: true }),

  reports: (params?: {
    search?: string;
    village_id?: string;
    severity?: string;
    month?: string;
    status?: string;
    category_id?: string;
    page?: number;
    limit?: number;
    priority?: string;
    assigned_unit_id?: string;
    sla?: string;
    creator_id?: string;
    appeal?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category_id) qs.set("category_id", params.category_id);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.priority) qs.set("priority", params.priority);
    if (params?.assigned_unit_id)
      qs.set("assigned_unit_id", params.assigned_unit_id);
    if (params?.sla) qs.set("sla", params.sla);
    if (params?.creator_id) qs.set("creator_id", params.creator_id);
    if (params?.search) qs.set("search", params.search);
    if (params?.village_id) qs.set("village_id", params.village_id);
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.month) qs.set("month", params.month);
    if (params?.appeal) qs.set("appeal", params.appeal);
    const query = qs.toString();
    return request<PaginatedReports>(`/reports${query ? `?${query}` : ""}`, {
      token: true,
    });
  },

  createReport: (body: {
    idempotency_key: string;
    category_id: string;
    description: string;
    lat: number;
    lng: number;
    photo_urls?: string[];
    device_id?: string;
    reported_at?: string;
    title?: string;
    population_affected?: number;
    vulnerability_index?: number;
    consent?: boolean;
  }) =>
    request<{ id: string; duplicate: boolean }>("/reports", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  report: (id: string) => request<Report>(`/reports/${id}`, { token: true }),

  reportPriority: (id: string) =>
    request<PriorityResponse>(`/reports/${id}/priority`, { token: true }),

  updateReportPriority: (
    id: string,
    body: {
      score: number;
      reason?: string;
      factor_breakdown?: Record<string, number>;
    },
  ) =>
    request<{
      status: "priority_updated";
      new_score: number;
      priority_score: number;
    }>(`/reports/${id}/priority`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  updateReport: (id: string, body: { status: ReportStatus; reason?: string }) =>
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
      body: JSON.stringify({
        refresh_token: useAuthStore.getState().refreshToken,
      }),
      token: true,
    }),

  reportsStats: () =>
    request<DashboardStats>("/reports/stats", { token: true }),

  publicStats: (params?: { period?: string }) => {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    const query = qs.toString();
    return request<PublicStats>(`/public/stats${query ? `?${query}` : ""}`);
  },

  publicStatsTrend: (params?: { days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set("days", String(params.days));
    const query = qs.toString();
    return request<{
      buckets: Array<{
        day: string;
        laporan_count: number;
        kasus_count: number;
        completed_count?: number;
      }>;
    }>(`/public/stats/trend${query ? `?${query}` : ""}`);
  },

  publicGamificationKecamatan: () =>
    request<{
      leaderboard: Array<{
        kecamatan: string;
        score: number;
        activity_rate: number;
        participation_rate: number;
        quality_rate: number;
        activity_percentile: number;
        participation_percentile: number;
        accepted_contributions: number;
        unique_contributors: number;
        adjudicated_total: number;
        active_months: number;
        denominator_source: string;
      }>;
    }>("/public/gamification/leaderboard/kecamatan"),

  publicGamificationUsers: () =>
    request<{
      leaderboard: Array<{
        rank: number;
        name: string;
        xp: number;
        level: number;
        reputation: number | null;
        status_changing_accepted: number;
      }>;
    }>("/public/gamification/leaderboard/users"),

  reportsClose: (id: string) =>
    request<{ status: string }>(`/reports/${id}/close`, {
      method: "POST",
      token: true,
    }),

  selfCloseReport: (id: string, body: { reason: string }) =>
    request<{
      success: boolean;
      status: string;
      cancelled_tasks: number;
    }>(`/reports/${id}/self-close`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  reportsAssign: (
    id: string,
    body: { assigned_unit_id: string; deadline?: string },
  ) =>
    request<{ status: string }>(`/reports/${id}/assign`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  reportAssessments: (reportId: string) =>
    request<{ assessments: AgentAssessment[] }>(
      `/agent/assessments/${reportId}`,
      { token: true },
    ),

  getTasks: () => request<TaskListResponse>(`/tasks`, { token: true }),

  submitVisit: (
    id: string,
    body: {
      findings: string;
      checklist: Array<{ item: string; checked: boolean }>;
      photo_urls?: string[];
      condition_assessment?: string;
      recommendation?: string;
      gps?: { lat: number; lng: number };
      notes?: string;
    },
  ) =>
    request<{
      visit_id: string;
      task_id: string;
      report_id: string;
      status: string;
      progress_percent: number;
      created_at: string;
    }>(`/tasks/${id}/visit`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  petugasTasks: (status?: string) =>
    request<TaskListResponse>(`/tasks${status ? `?status=${status}` : ""}`, {
      token: true,
    }),

  petugasAccept: (id: string, body: { accept: boolean; reason?: string }) =>
    request<{ task_id: string; status: string; accepted: boolean }>(
      `/tasks/${id}/accept`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token: true,
      },
    ),

  petugasProgress: (
    id: string,
    body: {
      progress_percent: number;
      notes?: string;
      estimated_completion?: string;
    },
  ) =>
    request<{
      status: string;
      progress_percent: number;
      progress_notes: string | null;
      estimated_completion: string | null;
    }>(`/tasks/${id}/progress`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token: true,
    }),

  petugasEvidence: async (
    id: string,
    body: { photo_urls: string[]; notes?: string; role?: "field" | "resolution" },
  ) => {
    return request<{
      success: boolean;
      evidence_id: number;
      task_id: string;
      photo_urls: string[];
    }>(`/tasks/${id}/evidence`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    });
  },

  petugasComplete: (
    id: string,
    body: { summary: string; completion_proof?: string | null },
  ) => {
    return request<{
      task_id: string;
      status: string;
      completion_proof: string | null;
      completed_at: string;
    }>(`/tasks/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    });
  },

  startTask: (id: string) =>
    request<{ task_id: string; status: string; started_at: string }>(
      `/tasks/${id}/start`,
      {
        method: "POST",
        token: true,
      },
    ),

  rejectTask: (id: string, body: { reason: string }) =>
    request<{ id: string; status: "rejected" }>(`/tasks/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  requestTaskClarification: (id: string, body: { message: string }) =>
    request<{ clarification_id: string | number; status: string }>(
      `/tasks/${id}/clarification`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token: true,
      },
    ),

  auditSearch: (params?: {
    actor_id?: string;
    action?: string;
    report_id?: string;
    object_id?: string;
    object_type?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    // Translate report_id → object_id and drop alias to avoid backend 400
    const { report_id: reportIdAlias, ...rest } = params ?? {};
    const translated: Record<string, unknown> = { ...rest };
    if (reportIdAlias && !translated.object_id) {
      translated.object_id = reportIdAlias;
      translated.object_type = "report";
    }
    const qs = Object.entries(translated)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return request<PaginatedAuditResponse>(
      `/audit/audit-search${qs ? `?${qs}` : ""}`,
      { token: true },
    );
  },

  exportAuditCsv: (params?: {
    actor_id?: string;
    action?: string;
    report_id?: string;
    from?: string;
    to?: string;
  }) =>
    request<string>(
      `/audit/audit-export?format=csv${
        params
          ? `&${Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join("&")}`
          : ""
      }`,
      { token: true, responseType: "text" },
    ),

  exportAuditJson: (params?: {
    actor_id?: string;
    action?: string;
    report_id?: string;
    from?: string;
    to?: string;
  }) =>
    request<string>(
      `/audit/audit-export?format=json${
        params
          ? `&${Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join("&")}`
          : ""
      }`,
      { token: true, responseType: "text" },
    ),

  exportCsv: (params?: { status?: string; category_id?: string }) =>
    request<string>(
      `/export/csv${
        params
          ? `?${Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join("&")}`
          : ""
      }`,
      { token: true, responseType: "text" },
    ),

  exportGeojson: (params?: { status?: string; category_id?: string }) =>
    request<{
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        geometry: { type: "Point"; coordinates: [number, number] };
        properties: {
          id: string;
          category_id: string;
          description: string;
          status: string;
          severity: number | null;
          created_at: string;
          thumbnail: string | null;
        };
      }>;
    }>(
      `/export/geojson${
        params
          ? `?${Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join("&")}`
          : ""
      }`,
      { token: true },
    ),

  exportPdf: (params?: {
    report_id?: string;
    status?: string;
    category_id?: string;
    from?: string;
    to?: string;
  }) =>
    request<Blob>(
      `/export/pdf${
        params
          ? `?${Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join("&")}`
          : ""
      }`,
      { token: true, responseType: "blob" },
    ),

  createReportPublic: (body: {
    address_area?: string;
    kelurahan?: string;
    category_id: string;
    description: string;
    lat: number;
    lng: number;
    photos?: string[];
    idempotency_key: string;
    device_id: string;
    title?: string;
  }) =>
    request<{ id: string; duplicate: boolean; status?: string }>(
      "/public/anonymous-reports",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  uploadReportPhoto: (
    reportId: string,
    file: File,
    purpose?: "task_evidence",
  ) => {
    const formData = new FormData();
    formData.append("photo", file);
    if (purpose) formData.append("purpose", purpose);
    return request<{ public_url: string }>(
      `/reports/${reportId}/photos/upload-url`,
      { method: "POST", body: formData, token: true },
    );
  },

  // Anonymous (unauthenticated) photo upload used by the public create-report
  // page. Mirrors the backend `/api/reports/photos/upload-url-anon` endpoint.
  uploadReportPhotoAnonymous: (file: File, idempotencyKey?: string) => {
    const formData = new FormData();
    formData.append("photo", file);
    if (idempotencyKey) formData.append("idempotency_key", idempotencyKey);
    return request<{ public_url: string }>(`/reports/photos/upload-url-anon`, {
      method: "POST",
      body: formData,
    });
  },

  notifications: () =>
    request<{ data: Notification[] }>("/notifications", { token: true }),
  pushConfiguration: () =>
    request<import("./push-types").PushConfiguration>(
      "/notifications/push-config",
      { token: true },
    ),
  subscribePush: (subscription: import("./push-types").WebPushSubscription) =>
    request<{ id: string }>("/notifications/subscriptions", {
      token: true,
      method: "POST",
      body: JSON.stringify(subscription),
    }),
  unsubscribePush: (endpoint: string) =>
    request<{ success?: boolean }>("/notifications/subscriptions", {
      token: true,
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
  testPush: () =>
    request<{ queued: boolean }>("/notifications/test", {
      token: true,
      method: "POST",
    }),

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

  units: () =>
    request<{
      items: Array<{
        id: string;
        nama: string;
        alamat: string | null;
        kontak: string | null;
        is_active: boolean;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    }>("/units", { token: true }),

  priorityConfig: () =>
    request<PaginatedPriorityVersions>("/priority-config", { token: true }),

  getAdminFailedAssessments: (params?: {
    page?: number;
    limit?: number;
    report_id?: string;
    tool_name?: string;
    permanent_dlq?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.report_id) qs.set("report_id", params.report_id);
    if (params?.tool_name) qs.set("tool_name", params.tool_name);
    if (params?.permanent_dlq !== undefined)
      qs.set("permanent_dlq", String(params.permanent_dlq));
    const query = qs.toString();
    return request<{
      data: Array<{
        id: string;
        report_id: string;
        tool_name: string;
        error: string;
        failed_at: string;
        retry_count: number;
        next_retry_at: string | null;
        last_error: string | null;
        permanent_dlq: boolean;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    }>(`/admin/failed-assessments${query ? `?${query}` : ""}`, { token: true });
  },

  getPriorityConfigVersions: (page = 1, limit = 20) =>
    request<PaginatedPriorityVersions>(
      `/priority-config?page=${page}&limit=${limit}`,
      { token: true },
    ),

  getPriorityConfigVersion: (version: number) =>
    request<PriorityFormulaVersion>(`/priority-config/${version}`, {
      token: true,
    }),

  createPriorityConfigVersion: (
    weights: {
      severity: number;
      impact: number;
      vulnerability?: number;
      report_count?: number;
      sla: number;
    },
    reason?: string,
  ) =>
    request<PriorityFormulaVersion>("/priority-config", {
      method: "POST",
      body: JSON.stringify({ weights, reason }),
      token: true,
    }),

  updatePriorityConfigVersion: (
    version: number,
    weights: {
      severity: number;
      impact: number;
      vulnerability: number;
      sla: number;
    },
  ) =>
    request<PriorityFormulaVersion>(`/priority-config/${version}`, {
      method: "PATCH",
      body: JSON.stringify({ weights }),
      token: true,
    }),

  activatePriorityConfigVersion: (version: number, reason?: string) =>
    request<PriorityFormulaVersion>(`/priority-config/${version}/activate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      token: true,
    }),

  createCategory: (body: {
    name: string;
    slug: string;
    icon?: string;
    description?: string;
    parent_id?: string | null;
  }) =>
    request<Category>("/categories", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  updateCategory: (
    id: string,
    body: {
      name?: string;
      slug?: string;
      icon?: string;
      description?: string;
      parent_id?: string | null;
    },
  ) =>
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

  users: (params?: {
    page?: number;
    limit?: number;
    role?: string;
    is_active?: boolean;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.role) qs.set("role", params.role);
    if (params?.is_active !== undefined)
      qs.set("is_active", String(params.is_active));
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return request<PaginatedUsers>(`/users${query ? `?${query}` : ""}`, {
      token: true,
    });
  },

  createUser: (body: {
    email: string;
    password: string;
    name: string;
    role: string;
  }) =>
    request<{ id: string; email: string; name: string; role: string }>(
      `/users`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token: true,
      },
    ),

  updateUser: (id: string, body: { role?: string; disabled?: boolean }) =>
    request<{
      id: string;
      email: string;
      name: string;
      role: string;
      disabled: boolean;
    }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token: true,
    }),

  deactivateUser: (id: string) =>
    request<{ message: string }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
      token: true,
    }),

  reactivateUser: (id: string) =>
    request<{ message: string }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
      token: true,
    }),

  deleteUser: (id: string) =>
    request<{ message: string }>(`/users/${id}`, {
      method: "DELETE",
      token: true,
    }),

  userAudit: (userId: string, params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params?.limit));
    qs.set("object_id", userId);
    const query = qs.toString();
    return request<PaginatedAuditResponse>(`/audit/audit-search?${query}`, {
      token: true,
    });
  },

  auditVerifyChain: () =>
    request<{ ok: boolean; count: number; first_break_at?: string }>(
      "/audit/verify-chain",
      {
        token: true,
      },
    ),

  auditorStats: () =>
    request<{
      counts: {
        total: number;
        last_24h: number;
        last_7d: number;
        last_30d: number;
      };
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
    }>("/audit/stats", { token: true }),

  reportTimeline: (id: string) =>
    request<{
      data: Array<{
        status: string;
        label: string;
        actor: string | null;
        actor_name: string | null;
        occurred_at: string;
      }>;
    }>(`/reports/${id}/timeline`, { token: true }),

  adminBacklog: (days?: number) =>
    request<{
      buckets: Array<{
        day: string;
        laporan_count: number;
        kasus_count: number;
        completed_count?: number;
      }>;
    }>(`/stats${days ? `?days=${days}` : ""}`, { token: true }),

  queueCounts: () =>
    request<QueueCounts | { queue_counts: QueueCounts }>("/stats", {
      token: true,
    }).then((d) => ("queue_counts" in d ? d.queue_counts : d)),

  getAdminCases: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    category_id?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.category_id) qs.set("category_id", params.category_id);
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return request<{
      items: Array<{
        id: string;
        category_id: string;
        description: string;
        lng: number;
        lat: number;
        status: string;
        severity: number | null;
        photo_urls: string[];
        created_at: string;
        updated_at: string;
        assigned_to: string | null;
        deadline: string | null;
        priority_score: number | null;
        category_name: string | null;
        category_slug: string | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    }>(`/cases/queue${query ? `?${query}` : ""}`, { token: true });
  },

  getAdminDashboardStats: () =>
    request<{
      total: number;
      by_status: Record<string, number>;
      by_severity: Record<string, number>;
      sla_breached: number;
      sla_at_risk: number;
      avg_resolution_days: number | null;
      by_category: Array<{
        id: string;
        name: string;
        slug: string;
        count: number;
      }>;
      recent_escalations: number;
    }>("/stats", { token: true }),

  mergeCase: (
    id: string,
    body: { target_case_ids: string[]; reason?: string },
  ) =>
    request<{
      status: string;
      primary_case_id: string;
      merged_case_ids: string[];
    }>(`/reports/${id}/merge`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  setCasePriority: (
    id: string,
    body: {
      score: number;
      reason?: string;
      factor_breakdown?: Record<string, unknown>;
    },
  ) =>
    request<{ status: string; new_score: number; priority_score: number }>(
      `/reports/${id}/priority`,
      { method: "POST", body: JSON.stringify(body), token: true },
    ),

  assignCase: (
    id: string,
    body: {
      unit_id?: string;
      assigned_unit_id?: string;
      assignee_type?: "unit" | "user";
      task_type?: "survei_verifikasi" | "perbaikan_fisik";
      instructions?: string;
      deadline?: string;
      reason?: string;
    },
  ) => {
    const payload = {
      assigned_unit_id: body.assigned_unit_id ?? body.unit_id,
      assignee_type: body.assignee_type,
      task_type: body.task_type,
      reason: body.reason,
      instructions: body.instructions,
      deadline: body.deadline,
    };
    return request<{
      status: string;
      assigned_to: string | null;
      deadline: string | null;
    }>(`/reports/${id}/assign`, {
      method: "POST",
      body: JSON.stringify(payload),
      token: true,
    });
  },

  facilitiesCluster: (params?: { bbox?: string; zoom?: number }) => {
    const qs = new URLSearchParams();
    if (params?.bbox) qs.set("bbox", params.bbox);
    if (params?.zoom !== undefined) qs.set("zoom", String(params.zoom));
    const query = qs.toString();
    return request<{ data: FacilityCluster[] }>(
      `/facilities/cluster${query ? `?${query}` : ""}`,
      { token: true },
    );
  },

  publicReportsCluster: (params?: {
    bbox?: string;
    month?: string;
    zoom?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.bbox) qs.set("bbox", params.bbox);
    if (params?.month) qs.set("month", params.month);
    if (params?.zoom !== undefined) qs.set("zoom", String(params.zoom));
    const query = qs.toString();
    return request<{
      data: Array<{
        lng: number;
        lat: number;
        count: number;
        dominant_status: string;
        dominant_category: string;
        color: string;
      }>;
    }>(`/public/reports/cluster${query ? `?${query}` : ""}`);
  },

  publicReports: (params?: {
    status?: string;
    category_id?: string;
    bbox?: string;
    month?: string;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category_id) qs.set("category_id", params.category_id);
    if (params?.bbox) qs.set("bbox", params.bbox);
    if (params?.month) qs.set("month", params.month);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<PublicReportsResponse>(
      `/public/reports${query ? `?${query}` : ""}`,
    );
  },

  execDashboard: () =>
    request<ExecutiveDashboard>("/analytics/dashboard", { token: true }),
  execRegionalStats: () =>
    request<RegionalStats>("/analytics/regional-stats", { token: true }),
  execTrendAnalysis: (period: "daily" | "weekly" | "monthly" = "daily") =>
    request<TrendData>(`/analytics/trend-analysis?period=${period}`, {
      token: true,
    }),

  reportsHeatmap: () => request<HeatmapData>("/reports/heatmap"),
  reportsNearby: (lat: number, lng: number) =>
    request<NearbyReports>(`/reports/nearby?lat=${lat}&lng=${lng}`, {
      token: true,
    }),
  reportDuplicates: (id: string) =>
    request<Duplicates>(`/reports/${id}/duplicates`, { token: true }),
  escalateReport: (id: string, reason: string) =>
    request<Report>(`/reports/${id}/escalate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      token: true,
    }),

  regionalDashboard: () =>
    request<AdminDashboard>("/regional/dashboard", { token: true }),
  regionalCases: () => request<Cases>("/regional/cases", { token: true }),
  regionalOperators: () =>
    request<AdminUsers>("/regional/operators", { token: true }),
  regionalPetugas: () => request<Petugas>("/regional/petugas", { token: true }),
  regionalSla: () =>
    request<SlaRulesResponse>("/regional/sla", { token: true }),

  createSlaRule: (body: {
    kategori_id: string;
    prioritas: "rendah" | "sedang" | "tinggi" | "kritis";
    jam: number;
  }) =>
    request<{
      id: string;
      kategori_id: string;
      prioritas: string;
      jam: number;
    }>("/regional/sla", {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  regionalUnits: () =>
    request<{
      items: Array<{
        id: string;
        nama: string;
        alamat: string | null;
        kontak: string | null;
        is_active: boolean;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    }>("/regional/units", { token: true }),

  adminQueue: (params?: {
    status?: string;
    kategori?: string;
    page?: number;
    limit?: number;
    assessment?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.kategori) qs.set("kategori", params.kategori);
    if (params?.assessment) qs.set("assessment", params.assessment);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<{
      items: Array<{
        id: string;
        category_id: string;
        description: string;
        lng: number | null;
        lat: number | null;
        status: string;
        severity: number | null;
        photo_urls: string[];
        created_at: string;
      }>;
      pagination: { total: number; total_pages: number };
    }>(`/cases/queue${query ? `?${query}` : ""}`, { token: true });
  },

  getCase: (id: string) =>
    request<{
      report: Report;
      assessments: AgentAssessment[];
      visits: SurveyVisit[];
      audit: AuditLogEntry[];
    }>(`/cases/${id}`, { token: true }),

  acceptCase: (
    id: string,
    body: { reason?: string; assigned_unit_id?: string; deadline?: string },
  ) =>
    request<{ status: string }>(`/cases/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  decideCase: (
    id: string,
    body: {
      decision: string;
      reason?: string;
      duplicate_of_report_id?: string;
      surveyor_id?: string;
      assigned_unit_id?: string;
      deadline?: string;
    },
  ) =>
    request<{ status: string }>(`/cases/${id}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  combineCases: (
    id: string,
    body: { target_case_id: string; reason?: string },
  ) =>
    request<{ status: "merged"; target_case_id: string }>(
      `/cases/${id}/combine`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token: true,
      },
    ),

  separateCase: (
    id: string,
    body: { new_case_description: string; reason?: string },
  ) =>
    request<{ status: string; new_case_id: string }>(`/cases/${id}/separate`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  rejectCase: (id: string, body: { reason: string }) =>
    request<{ status: string }>(`/cases/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  verifyCompletion: (
    id: string,
    body: { decision: string; reason?: string; completion_notes?: string },
  ) =>
    request<{ status: string }>(`/cases/${id}/verify-completion`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  reviewSanggahan: (id: string, body: { decision: string; reason?: string }) =>
    request<{ status: string }>(`/cases/${id}/review-sanggahan`, {
      method: "POST",
      body: JSON.stringify(body),
      token: true,
    }),

  geocodeReverse: (lat: number, lng: number) =>
    request<Geocode>(`/geocode/reverse?lat=${lat}&lng=${lng}`),

  logClientError: (entry: {
    level: string;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
  }) =>
    request<void>("/client-errors", {
      method: "POST",
      body: JSON.stringify(entry),
    }),

  createUnit: (body: { name: string; description?: string }) =>
    request<{ id: string; name: string }>(`/units`, {
      method: "POST",
      body: JSON.stringify({ name: body.name }),
      token: true,
    }),

  syncQuality: () =>
    request<SyncQuality>("/stats/sync-quality", { token: true }),

  retryBatchAssessments: (ids: string[]) =>
    request<{
      results: Array<{
        id: string;
        success: boolean;
        message: string;
        retry_count?: number;
        permanent_dlq?: boolean;
        error?: string;
      }>;
    }>("/admin/failed-assessments/retry-batch", {
      method: "POST",
      body: JSON.stringify({ ids }),
      token: true,
    }),

  facilities: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<{
      data: Facility[];
      pagination: { total: number; page: number; limit: number };
    }>(`/facilities${query ? `?${query}` : ""}`, { token: true });
  },

  agentAssessmentsList: (params?: {
    reportId?: string;
    model_version?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.reportId) qs.set("reportId", params.reportId);
    if (params?.model_version) qs.set("model_version", params.model_version);
    const query = qs.toString();
    return request<{ assessments: StoredAgentAssessment[] }>(
      `/agent/assessments${query ? `?${query}` : ""}`,
      { token: true },
    );
  },
};
