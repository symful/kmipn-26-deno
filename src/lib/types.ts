// ============================================================
// CANONICAL TYPE DEFINITIONS — SIGAP Backend
// Single source of truth for all shared types across backend + frontends
// All field names are snake_case for API responses
// ============================================================

// --- Enums / String Unions ---

export const ROLES = ["ADMIN", "PETUGAS", "WARGA"] as const;
export type Role = (typeof ROLES)[number];

// ReportStatus: all valid report statuses (snake_case)
export const REPORT_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "rejected",
  "duplicate_merged",
  "needs_survey",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// CaseStatusLiteral: snake_case case status values (from normalizeCaseStatus)
export type CaseStatusLiteral =
  | "menunggu_verifikasi"
  | "terverifikasi"
  | "sedang_ditangani"
  | "selesai"
  | "ditolak"
  | "duplikat"
  | "perlu_kelengkapan"
  | "sla_terlewat";

// PriorityBucket: human-readable priority labels
export const PRIORITY_BUCKETS = [
  "rendah",
  "sedang",
  "tinggi",
  "kritis",
] as const;
export type PriorityBucket = (typeof PRIORITY_BUCKETS)[number];

// Severity levels (for internal scoring)
export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

// Decision types used by admin
export const CASE_DECISIONS = [
  "valid",
  "needs_completion",
  "needs_survey",
  "duplicate",
  "out_of_scope",
  "rejected",
  "needs_clarification",
] as const;
export type CaseDecision = (typeof CASE_DECISIONS)[number];

// Petugas task status
export const PETUGAS_STATUSES = [
  "assigned",
  "in_progress",
  "pending_clarification",
  "completed",
] as const;
export type PetugasStatus = (typeof PETUGAS_STATUSES)[number];

// ============================================================
// OBJECT TYPES
// ============================================================

// Canonical pagination — used by ALL list endpoints
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// Wrapper for paginated responses
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// Canonical User shape (what the API returns — NEVER returns password_hash)
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

// Public user (what warga sees)
export interface PublicUser {
  id: string;
  name: string;
  role: Role;
}

// Canonical Category shape
export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  parent_id: string | null;
  created_at: string;
}

// Canonical Report shape (detail — includes computed geom)
export interface Report {
  id: string;
  idempotency_key: string;
  category_id: string;
  category?: Category; // joined in list/detail
  description: string;
  lng: number;
  lat: number;
  geom?: { type: "Point"; coordinates: [number, number] }; // computed, detail only
  photo_urls: string[] | null;
  device_id: string | null;
  status: ReportStatus;
  severity: number | null;
  priority_score: number | null;
  priority_bucket: PriorityBucket | null;
  assigned_to: string | null;
  assignee: PublicUser | null;
  title: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  merged_into: string | null;
}

// Report list item (what GET /reports returns — lighter than detail)
export interface ReportListItem {
  id: string;
  idempotency_key: string;
  category_id: string;
  category?: { id: string; name: string; icon: string | null };
  description: string;
  lng: number;
  lat: number;
  photo_urls: string[] | null;
  status: ReportStatus;
  severity: number | null;
  priority_score: number | null;
  priority_bucket: PriorityBucket | null;
  assigned_to: string | null;
  assignee?: { id: string; name: string };
  title: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  reported_at: string | null;
}

// Canonical SLA rule shape
export interface SlaRule {
  id: string;
  kategori_id: string | null;
  kategori_nama: string | null;
  prioritas: PriorityBucket;
  jam: number; // hours
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Canonical Unit shape (admin-daerah units table)
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

// Canonical AuditEntry shape
export interface AuditEntry {
  id: string;
  actor: string;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}

// Audit search response
export interface AuditSearchResponse {
  data: AuditEntry[];
  pagination: Pagination;
}

// Canonical DuplicateCandidate shape
export interface DuplicateCandidate {
  report_id: string;
  distance_m: number;
  description: string;
  created_at: string;
  similarity_score?: number; // computed, optional
  report_count?: number;
}

// Canonical TimelineEvent shape
export interface TimelineEvent {
  id: string;
  status: string;
  label: string;
  actor: string;
  actor_name: string | null;
  occurred_at: string;
}

// Case detail — assessments flattened
export interface Assessment {
  id: string;
  tool_name: string;
  status: string;
  confidence: number;
  result: Record<string, unknown>;
  created_at: string;
}

// Canonical PriorityScoreResult (from priority calculator)
export interface PriorityScoreResult {
  total_score: number;
  breakdown: {
    severity: number;
    impact: number;
    vulnerability: number;
    sla: number;
  };
  other_factors: {
    sla_proximity: number;
    reporter_reliability: number;
  };
  override_score?: number;
  config_version: number;
  computed_at?: string;
}

// Public report item (what warga/public sees)
export interface PublicReportItem {
  id: string;
  category: {
    id: string;
    short_code: string | null;
    name: string | null;
    icon: string | null;
  };
  kecamatan: string | null;
  kelurahan: string | null;
  kabupaten: string | null;
  provinsi: string | null;
  status: ReportStatus;
  last_updated: string;
  public_progress: number;
  moderated_photo_url: string | null;
  share_token: string | null;
  supporting_count: number;
}

// Public case detail
export interface PublicCaseDetail {
  id: string;
  category_id: string;
  status: ReportStatus;
  created_at: string;
  last_updated: string;
  public_progress: number;
  moderated_photo_url: string | null;
  share_token: string | null;
  generalized_location: string | null;
  severity: number | null;
  title: string | null;
  description: string | null;
}

// Case detail (full verifikator view)
export interface CaseDetail {
  report: Report;
  assessments: Assessment[];
  visits: unknown[]; // surveyor visit records
  audit: AuditEntry[];
}
