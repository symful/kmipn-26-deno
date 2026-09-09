export type Role = "ADMIN" | "PETUGAS" | "WARGA";

export type ReportStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "verified"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | "rejected"
  | "duplicate_merged"
  | "needs_completion"
  | "merged"
  | "separated"
  | "out_of_scope"
  | "under_verification"
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
  address_area?: string | null;
  id: string;
  idempotency_key: string;
  category_id: string;
  category?: { id: string; name: string; icon: string | null };
  description: string;
  lng: number;
  lat: number;
  geom?: { type: "Point"; coordinates: [number, number] };
  photo_urls: string[];
  device_id: string | null;
  status: ReportStatus;
  severity: number | null;
  priority_score: number | null;
  priority_bucket: PriorityBucket | null;
  assigned_to: string | null;
  assignee: User | null;
  created_at: string;
  updated_at: string;
  deadline?: string | null;
  title?: string | null;
  kecamatan?: string | null;
  kelurahan?: string | null;
  kabupaten?: string | null;
  provinsi?: string | null;
  impact_dampak?: string | null;
  supporting_count?: number | null;
  supporting_reports?: Array<{
    id: string;
    title: string | null;
    description: string;
    photo_urls: string[];
    created_at: string;
  }>;
  merged_into?: string | null;
  appeal_status?: "pending" | "accepted" | "rejected" | null;
  village_name?: string | null;
  report_count?: number | null;
}

export interface AssessmentResult {
  source?: "recorded_database_evidence";
  visits?: Array<{
    id: string;
    task_id: string;
    findings: unknown;
    checklist: unknown;
    photo_urls: string[] | null;
    gps_data: unknown;
    created_at: string;
  }>;
  checklist_template?: {
    id: string;
    category_id: string;
    version: number;
    items: Array<{ item: string; required: boolean }>;
  } | null;
  complete?: boolean;
  missing_fields?: string[];
  quality_ok?: boolean;
  blur_score?: number;
  exposure_ok?: boolean;
  resolution_ok?: boolean;
  consistent?: boolean;
  authenticity_score?: number | null;
  authenticity_label?: string;
  exif_gps?: { lat: number; lng: number } | null;
  exif_timestamp?: string | null;
  distance_meters?: number | null;
  time_delta_hours?: number | null;
  damage_visible?: boolean;
  damage_type?: string;
  damage_label?: string;
  damage_description?: string;
  severity_label?: string;
  duplication_level?: string;
  duplication_summary?: string;
  severity?: string;
  description?: string;
  category?: string;
  category_name?: string;
  suggested_category?: string;
  rationale?: string;
  duplicates_found?: boolean;
  duplicate_count?: number;
  candidates?: DuplicateCandidate[];
  pii_detected?: boolean;
  redaction_needed?: boolean;
  pii_types?: string[];
  summary?: string;
  confidence?: number;
  supporting_factors?: string[];
  risk_factors?: string[];
  correlation_ids?: string[];
}

export interface AgentAssessment {
  id: string;
  tool_name: string;
  confidence: number | null;
  status: string;
  result: AssessmentResult;
  agent_version?: string;
  rule_version?: string;
  factors?: { supporting: string[]; risk: string[]; correlation_ids: string[] };
  created_at: string;
}

export interface StoredAgentAssessment extends AgentAssessment {
  report_id: string;
  agent_version: string;
  factors: { supporting: string[]; risk: string[]; correlation_ids: string[] };
}
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type UserRole = "ADMIN" | "PETUGAS" | "WARGA";

export interface PaginatedUsers {
  data: UserRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
  user: { id: string; email: string; name: string; role: string };
}

export interface PaginatedReports {
  data: Report[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  next?: PaginatedReports;
}

export interface ReportDetailResponse {
  report: Report;
  timeline: TimelineEvent[];
  assessments: AgentAssessment[];
}

export type ReportsListResponse = PaginatedReports;

export interface KategoriListResponse {
  data: Category[];
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

const rawApiBase =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : "/api";

// Backend mounts all routes under /api. Normalize so API_BASE always ends with /api
// (e.g. when VITE_API_BASE_URL is an absolute URL like https://...workers.dev).
const API_BASE = rawApiBase.replace(/\/+$/, "").endsWith("/api")
  ? rawApiBase.replace(/\/+$/, "")
  : `${rawApiBase.replace(/\/+$/, "")}/api`;

export { API_BASE };

export interface AuditEntry {
  id: string;
  actor: string;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string;
  before_data: unknown;
  after_data: unknown;
  reason: string | null;
  created_at: string;
}

// Alias for backwards compatibility
export type AuditLogEntry = AuditEntry;

export interface DuplicateCandidate {
  report_id: string;
  distance_m: number;
  description: string;
  created_at: string;
  similarity_score?: number;
}

/* ------------------------------------------------------------------ */
/*  AI Assessment Tool Result Shapes (parsed from AgentAssessment.result) */
/* ------------------------------------------------------------------ */

export interface LocationTimeConsistencyResult {
  consistent: boolean;
  confidence: number;
  gps_valid: boolean;
  gps_coords?: { lat: number; lng: number };
  exif_timestamp?: string;
  report_timestamp?: string;
  mismatch_reason?: string;
}

export interface DamageIndicatorsResult {
  damage_detected: boolean;
  damage_type: string;
  severity: "low" | "medium" | "high" | "critical";
  severity_score: number;
  description?: string;
}

export interface DuplicateFindingsResult {
  duplicates_found: boolean;
  candidates: DuplicateCandidate[];
}

export interface PrivacyRiskResult {
  pii_detected: boolean;
  pii_types: string[];
  risk_level: "low" | "medium" | "high";
}

export interface AgentAssessmentMeta {
  latency_ms?: number;
  model_version?: string;
  total_tokens?: number;
}

/* ------------------------------------------------------------------ */
/*  Priority Score Panel Types                                        */
/* ------------------------------------------------------------------ */

export interface PriorityBreakdownItem {
  label: string;
  value: number;
  max: number;
  color: string;
}

export interface VerificationQueueFacility extends Facility {
  photo_urls?: string[];
  current_status?: string;
  assigned_to?: string | null;
  deadline?: string | null;
  sla_breached?: boolean;
  sla_remaining_hours?: number | null;
}

export interface TimelineEvent {
  id: string;
  status: string;
  label: string;
  actor: string;
  actor_name: string | null;
  occurred_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PriorityScore {
  score: number;
  bucket: PriorityBucket;
  breakdown: {
    severity: number;
    impact: number;
    vulnerability: number;
    sla: number;
  };
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
  user_id: string | null;
  type: string;
  title: string;
  body: string;
  related_report_id: string | null;
  read_at: string | null;
  created_at: string;
  kind?: string;
  related_case_id?: string;
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
  sla_breached: number;
  sla_at_risk: number;
  avg_verification_days: number;
}

export interface PublicStats {
  total: number;
  total_cases: number;
  by_status: Record<string, number>;
  by_category: Array<{ category_id: string; count: number }>;
  recent_reports_7d: number;
  resolution_rate_7d: number;
  sla_breached?: number;
  sla_compliance?: number;
}

export interface SyncQuality {
  sync_percentage: number | null;
  pending_sync_count: number;
  failed_sync_count: number;
  reporting_devices: number;
  tracked_reports: number;
  source: "latest_device_observations";
  last_observed_at: string | null;
  offline_originated: number;
  total: number;
  avg_sync_latency_seconds: number | null;
  max_sync_latency_seconds: number | null;
}

export interface Facility {
  id: string;
  primary_report_id: string;
  category_id: string;
  canonical_name: string | null;
  severity: number | null;
  urgency_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  category_name: string;
  lng: number;
  lat: number;
  report_count: number;
}

export interface PaginatedAuditResponse {
  entries: Array<
    Omit<AuditLogEntry, "before_data" | "after_data"> & {
      before: unknown;
      after: unknown;
    }
  >;
  data: AuditLogEntry[];
  pagination: { page: number; limit: number; total: number };
}

export interface Unit {
  id: string;
  nama: string;
  alamat: string | null;
  kontak: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface UnitsResponse {
  items: Unit[];
  pagination: Pagination;
}

export type PriorityBucket = "rendah" | "sedang" | "tinggi" | "kritis";
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
    vulnerability?: number;
    report_count?: number;
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
  report_count?: number;
}

export interface PriorityResponse {
  id: string;
  version: number;
  score: number;
  level: "Rendah" | "Sedang" | "Tinggi" | "Kritis";
  breakdown: PriorityBreakdown;
}

export interface FacilityCluster {
  lng: number;
  lat: number;
  count: number;
  dominant_status: string;
  dominant_category: string;
  color: string;
}

export interface QueueCounts {
  new_reports: number;
  needs_verification: number;
  sla_breached: number;
  high_priority: number;
  needs_completion: number;
}

export interface ExecutiveDashboard {
  total_reports: number;
  verified_reports: number;
  resolved_reports: number;
  avg_resolution_days: number;
  sla_breach_rate: number;
  reports_by_status: Record<string, number>;
  reports_by_category: Array<{ category_id: string; count: number }>;
}

export interface RegionalStats {
  regions: Array<{
    name: string;
    total: number;
    verified: number;
    resolved: number;
  }>;
}

export interface TrendData {
  period: string;
  submissions: Array<{
    period: string;
    total_submissions: number;
    resolved: number;
    active: number;
    avg_severity: number | null;
  }>;
  by_category: Array<{
    period: string;
    category_slug: string;
    category_name: string;
    count: number;
  }>;
  avg_resolution_days: Array<{
    period: string;
    avg_resolution_days: number | null;
  }>;
  avg_verification_days: Array<{
    period: string;
    avg_verification_days: number | null;
  }>;
  sla_breaches: Array<{ period: string; breached_count: number }>;
}

export interface HeatmapData {
  points: Array<{
    lat: number;
    lng: number;
    intensity: number;
  }>;
}

export interface NearbyReports {
  reports: Array<{
    id: string;
    distance_m: number;
    category_id: string;
    status: string;
    created_at: string;
  }>;
}

export interface Duplicates {
  candidates: Array<{
    report_id: string;
    description: string | null;
    status: string | null;
    photo_url: string | null;
    distance_m: number;
    report_count: number;
    similarity_score: number;
  }>;
}

export interface AdminDashboard {
  total: number;
  by_status: Record<string, number>;
  by_category: Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
    count: number;
  }>;
  active_admins: number;
  active_petugas: number;
  sla_breached: number;
  sla_at_risk: number;
  avg_verification_days: number | null;
  recent_submissions: number;
  resolved_this_month: number;
}

export interface Cases {
  items: Array<{
    id: string;
    status: string;
    category_id: string;
    created_at: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface AdminUsers {
  items: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    created_at: string;
    updated_at: string;
    disabled?: boolean;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface Petugas {
  items: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    disabled: boolean;
    created_at: string;
    updated_at: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface SLA {
  sla_stats: Array<{
    status: string;
    within_sla: number;
    breached: number;
  }>;
}

export interface SlaRule {
  id: string;
  kategori_id: string;
  kategori_nama: string | null;
  prioritas: "rendah" | "sedang" | "tinggi" | "kritis";
  jam: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SlaRulesResponse {
  items: SlaRule[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface Geocode {
  address: string;
  latitude: number;
  longitude: number;
}

export interface PublicReport {
  severity?: number | null;
  id: string;
  title?: string;
  report_count?: number;
  category: {
    id: string;
    short_code: string | null;
    name: string | null;
    icon: string | null;
  };
  wilayah: {
    kecamatan: string | null;
    desa: string | null;
  };
  general_wilayah: string;
  status: ReportStatus;
  last_updated: string;
  public_progress: number | null;
  moderated_photo_url: string | null;
  generalized_location: { lat: number; lng: number } | null;
  supporting_count: number;
}

export interface PublicReportsResponse {
  data: PublicReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface AnonymousReportRequest {
  category_id: string;
  description: string;
  lat: number;
  lng: number;
  photo_urls?: string[];
  idempotency_key: string;
  device_id: string;
}
