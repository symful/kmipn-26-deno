export type Role = "WARGA" | "SURVEYOR" | "VERIFIKATOR" | "OPERATOR" | "PETUGAS" | "PENGAMBIL_KEPUTUSAN" | "ADMIN_DAERAH" | "AUDITOR" | "RT_RW" | "ADMIN";

export type ReportStatus = "submitted" | "under_review" | "verified" | "in_progress" | "resolved" | "rejected" | "duplicate_merged" | "needs_survey";

export type AssessmentStatus = "completed" | "timeout" | "parse_failed" | "vlm_error";

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  created_at: string;
}

export interface Wilayah {
  id: string;
  parent_id?: string;
  name: string;
  level: "PROVINSI" | "KABUPATEN" | "KECAMATAN" | "DESA";
  geom?: Record<string, unknown>;
  created_at: string;
}

export interface Report {
  id: string;
  idempotency_key: string;
  category_id: string;
  category?: Category;
  description: string;
  geom?: Record<string, unknown>;
  lat: number;
  lng: number;
  photo_urls?: string[];
  exif_data?: Record<string, unknown>;
  device_id?: string;
  status: ReportStatus;
  severity?: number;
  assigned_to?: string;
  assignee?: User;
  created_at: string;
  updated_at: string;
}

export interface CreateReportRequest {
  idempotency_key: string;
  category_id: string;
  description: string;
  lat: number;
  lng: number;
  photo_urls?: string[];
  exif_data?: Record<string, unknown>;
  device_id?: string;
}

export interface UpdateReportRequest {
  status?: ReportStatus;
  severity?: number;
  assigned_to?: string;
}

export interface AgentAssessment {
  id: string;
  report_id: string;
  assessment_kind: string;
  assessment_status: AssessmentStatus;
  vision_description?: string;
  damage_severity?: number;
  exif_summary?: Record<string, unknown>;
  duplicate_candidates?: Record<string, unknown>[];
  confidence?: number;
  recommended_status?: ReportStatus;
  tool_calls_made?: number;
  latency_ms?: number;
  model_version?: string;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: User;
}

export interface ErrorResponse {
  error: string;
  detail?: string;
}

export interface GeoJSONFeatureCollection {
  type: string;
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: string;
  geometry: Record<string, unknown>;
  properties: {
  id: string;
  status: ReportStatus;
  category_id: string;
  description: string;
  severity?: number;
  created_at: string;
};
}

export interface GeoJSONPoint {
  type: string;
  coordinates: number[];
}

export interface GeoJSONPolygon {
  type: string;
  coordinates: number[][][];
}
