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
  | "needs_survey"
  | "merged"
  | "separated"
  | "needs_completion"
  | "out_of_scope"
  | "pending";

export type Priority = "low" | "medium" | "high" | "critical";

export interface DuplicateCandidate {
  report_id?: string;
  description?: string;
  status?: string;
  photo_url?: string;
  distance_m?: number;
  report_count?: number;
  similarity_score?: number;
}

export interface ErrorResponse {
  error?: string;
  details?: Record<string, unknown>[];
}

export interface Pagination {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface Photo {
  id?: string;
  url?: string;
  thumbnailUrl?: string;
  uploadedAt?: string;
}

export interface TimelineEvent {
  id?: string;
  type?: string;
  message?: string;
  timestamp?: string;
  userId?: string;
}

export interface Notification {
  id?: string;
  title?: string;
  body?: string;
  read?: boolean;
  createdAt?: string;
}

export interface AuditEntry {
  id?: string;
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface Category {
  id?: string;
  name?: string;
  icon?: string;
  reportCount?: number;
}

export interface Unit {
  id?: string;
  name?: string;
  type?: string;
  region?: string;
}

export interface SlaConfig {
  id?: string;
  name?: string;
  slaDays?: number;
  priority?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface ChecklistTemplate {
  id?: string;
  name?: string;
  items?: Record<string, unknown>[];
  createdAt?: string;
}

export interface PriorityConfig {
  id?: string;
  name?: string;
  rules?: Record<string, unknown>[];
  isActive?: boolean;
  createdAt?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token?: string;
  refreshToken?: string;
  user?: User;
}

export interface User {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  unitId?: string;
  createdAt?: string;
}

export interface UserResponse {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  unitId?: string;
  createdAt?: string;
}

export interface Report {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  status?: ReportStatus;
  priority?: Priority;
  location?: Record<string, unknown>;
  reporterId?: string;
  photos?: string[];
  slaDeadline?: string;
  createdAt?: string;
  updatedAt?: string;
  mergedInto?: string;
  deadline?: string;
  severity?: number;
  priorityScore?: number;
  priorityBucket?: string;
  lng?: number;
  lat?: number;
}

export interface ReportDetail {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  status?: ReportStatus;
  priority?: Priority;
  location?: Record<string, unknown>;
  reporterId?: string;
  photos?: string[];
  assessments?: Record<string, unknown>[];
  visits?: Record<string, unknown>[];
  slaDeadline?: string;
  lng?: number;
  lat?: number;
  priorityBucket?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateReportRequest {
  title: string;
  description: string;
  category: string;
  address?: string;
  lat: number;
  lng: number;
  photos?: string[];
}

export interface CaseDetail {
  id?: string;
  report?: Report;
  assessments?: Record<string, unknown>[];
  visits?: Record<string, unknown>[];
  audit?: AuditEntry[];
  status?: string;
}

export interface SurveyorTask {
  taskId?: string;
  reportId?: string;
  reportTitle?: string;
  status?: string;
  assignedAt?: string;
  completedAt?: string;
  deadline?: string;
  code?: string;
  slaHoursRemaining?: number;
  priority?: string;
  reportLat?: number;
  reportLng?: number;
  address?: string;
  categoryName?: string;
}

export interface PetugasTask {
  taskId?: string;
  reportId?: string;
  reportTitle?: string;
  status?: string;
  evidenceUrls?: string[];
  assignedAt?: string;
  completedAt?: string;
}

export interface TaskDetail {
  taskId?: string;
  reportId?: string;
  reportTitle?: string;
  description?: string;
  status?: string;
  progress?: number;
  evidenceUrls?: Record<string, unknown>[];
  clarification?: Record<string, unknown>[];
  assignedAt?: string;
  completedAt?: string;
}

export interface StatsResponse {
  total?: number;
  byStatus?: Record<string, unknown>;
  byCategory?: Record<string, unknown>[];
  activeTasks?: number;
  pendingTasks?: number;
  resolvedToday?: number;
  slaAtRisk?: number;
  slaBreached?: number;
  merged?: number;
  separated?: number;
  escalated?: number;
  operatorName?: string;
  region?: string;
  dashboard?: Record<string, unknown>;
}
