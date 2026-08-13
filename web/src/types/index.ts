export type Role =
  | "ADMIN"
  | "VERIFIKATOR"
  | "SURVEYOR"
  | "OPERATOR"
  | "RT_RW"
  | "AUDITOR"
  | "PENGAMBIL_KEPUTUSAN"
  | "PETUGAS"
  | "ADMIN_DAERAH"
  | "WARGA"
  | "PUBLIK";

export type ReportStatus =
  | "submitted"
  | "under_review"
  | "verified"
  | "in_progress"
  | "resolved"
  | "rejected"
  | "duplicate_merged"
  | "needs_survey";

export type AssessmentStatus =
  "completed" | "timeout" | "parse_failed" | "vlm_error";

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface ExifData {
  [key: string]: unknown;
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONPoint;
  properties: {
    id: string;
    status: ReportStatus;
    category_id: string;
    description: string;
    severity: number | null;
    created_at: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface Report {
  id: string;
  idempotency_key: string;
  category_id: string;
  category?: Category;
  description: string;
  geom: GeoJSONPoint;
  lat: number;
  lng: number;
  photo_urls: string[];
  exif_data: ExifData | null;
  device_id: string | null;
  status: ReportStatus;
  severity: number | null;
  assigned_to: string | null;
  assignee: User | null;
  created_at: string;
  updated_at: string;
}

export interface AgentAssessment {
  id: string;
  report_id: string;
  assessment_kind: string;
  assessment_status: AssessmentStatus;
  vision_description: string | null;
  damage_severity: number | null;
  exif_summary: ExifData | null;
  duplicate_candidates: Array<{ report_id: string; distance_m: number }> | null;
  confidence: number | null;
  recommended_status: ReportStatus | null;
  tool_calls_made: number | null;
  latency_ms: number | null;
  model_version: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  wilayah_id?: string | null;
  disabled?: boolean;
}

export type UserRole = "ADMIN" | "VERIFIKATOR" | "SURVEYOR" | "OPERATOR" | "RT_RW" | "PETUGAS" | "ADMIN_DAERAH" | "AUDITOR" | "PENGAMBIL_KEPUTUSAN";

export interface PaginatedUsers {
  data: UserRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  wilayah_id: string | null;
  disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface PaginatedReports {
  reports: Report[];
  total: number;
  page: number;
}

export interface KategoriListResponse {
  categories: Category[];
}

export interface AgentAssessRequest {
  report_id: string;
  assessment_kind?: string;
}

export interface AgentAssessResponse {
  report_id: string;
  overall_status: "completed" | "partial" | "failed";
  exif?: {
    valid: boolean;
    reason?: string;
    gps?: { lat: number; lng: number };
    timestamp?: string;
    camera?: string;
    software?: string;
  };
  duplicates?: Array<{
    report_id: string;
    distance_m: number;
  }>;
  vision?: {
    damage_detected: boolean;
    severity: "low" | "medium" | "high" | "unknown";
    confidence: number;
    description: string;
    vlm_error?: string;
  };
}

const API_BASE =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : "/api";

export { API_BASE };

export interface AuditLogEntry {
  id: string;
  actor: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  prev_hash: string;
  entry_hash: string;
  created_at: string;
}

export interface PriorityScore {
  report_id: string;
  score: number;
  factors: {
    severity: number;
    affected_residents: number;
    region_vulnerability: number;
    sla_pressure: number;
  };
  computed_at: string;
  formula_version: string;
}

export interface SurveyVisit {
  id: string;
  task_id: string;
  surveyor_id: string;
  findings: string | null;
  checklist: Array<{ item: string; checked: boolean }>;
  photo_urls: string[];
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "case_assigned" | "status_changed" | "new_comment" | "report_synced";
  title: string;
  body: string;
  related_report_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface WilayahNode {
  id: string;
  parent_id: string | null;
  level: string;
  name: string;
  code: string;
  children?: WilayahNode[];
}

export interface CategoryWithCount {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  count: number;
}

export interface DashboardStats {
  total: number;
  by_status: Record<string, number>;
  by_category: CategoryWithCount[];
  by_wilayah: Array<{ wilayah_id: string; count: number }>;
  sla_breached: number;
  sla_at_risk: number;
  avg_verification_days: number;
}

export interface PaginatedAuditResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedOutboxResponse {
  entries: Array<{
    id: string;
    created_at: string;
    target_system: string;
    payload: unknown;
    status: string;
    retry_count: number;
    last_attempt_at: string | null;
    error_message: string | null;
    related_report_id: string | null;
  }>;
  total: number;
  page: number;
  limit: number;
}

export interface Unit {
  id: string;
  name: string;
  type: "surveyor_team" | "field_unit";
}

export interface UnitsResponse {
  units: Unit[];
}

export type PriorityBucket = "rendah" | "sedang" | "tinggi" | "kritis" | "";
export type SLABucket = "mendekati" | "melanggar" | "";

export interface RegionFilterValue {
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  desa: string;
}

export interface PriorityFormulaVersion {
  id: string;
  version: number;
  weights: {
    severity: number;
    impact: number;
    vulnerability: number;
    sla: number;
  };
  is_active: boolean;
  activated_at: string | null;
  activated_by: string | null;
  created_at: string;
}

export interface PaginatedPriorityVersions {
  data: PriorityFormulaVersion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface PriorityConfig {
  id: string;
  version: number;
  severity: number;
  affected_residents: number;
  region_vulnerability: number;
  sla_pressure: number;
  is_active: boolean;
  created_at: string;
}

export interface PriorityBreakdown {
  severity: number;
  affected_residents: number;
  region_vulnerability: number;
  sla_pressure: number;
  other_factors: number;
}

export interface PriorityResponse {
  id: string;
  version: number;
  score: number;
  level: "Rendah" | "Sedang" | "Tinggi" | "Kritis";
  breakdown: PriorityBreakdown;
}
