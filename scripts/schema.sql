-- ============================================================
-- SIGAP Canonical D1 Schema
-- Single source of truth for Cloudflare D1/SQLite
-- Roles: ADMIN, PETUGAS, WARGA
-- ============================================================

-- ============================================================
-- PHASE 0: Auth & User Management
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','PETUGAS','WARGA')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  disabled INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  revoked_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  parent_id TEXT,
  code TEXT,
  short_code TEXT,
  color_class TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- ============================================================
-- PHASE 0: Units
-- ============================================================

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  alamat TEXT,
  kontak TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

-- ============================================================
-- PHASE 1: Reports (core domain entity)
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  local_id TEXT,
  category_id TEXT NOT NULL,
  reporter_id TEXT,
  description TEXT NOT NULL,
  impact TEXT DEFAULT '{}',
  lat REAL,
  lng REAL,
  photo_urls TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','verified','assigned','in_progress','resolved','closed','rejected','merged','separated','duplicate_merged','needs_survey','needs_completion','out_of_scope','pending_clarification')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  idempotency_key TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now')),
  address_area TEXT,
  impact_dampak TEXT,
  kecamatan TEXT,
  kelurahan TEXT,
  kabupaten TEXT,
  provinsi TEXT,
  severity INT CHECK (severity IS NULL OR (severity >= 0 AND severity <= 100)),
  merged_into TEXT,
  separated_into TEXT,
  rejection_reason TEXT,
  deadline TEXT,
  verified_at TEXT,
  population_affected INT,
  vulnerability_index REAL,
  ai_recommended_status TEXT,
  reported_at TEXT NOT NULL DEFAULT (datetime('now')),
  title TEXT,
  facility_card_id TEXT,
  facility_card TEXT,
  device_id TEXT,
  assigned_to TEXT,
  geom TEXT,
  priority INT CHECK (priority IS NULL OR (priority BETWEEN 1 AND 5))
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category_id);
CREATE INDEX IF NOT EXISTS idx_reports_idempotency ON reports(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_verified_at ON reports(verified_at);
CREATE INDEX IF NOT EXISTS idx_reports_deadline ON reports(deadline);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority);
CREATE INDEX IF NOT EXISTS idx_reports_vulnerability_index ON reports(vulnerability_index);
CREATE INDEX IF NOT EXISTS idx_reports_reported_at ON reports(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_facility_card_id ON reports(facility_card_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_lat_lng ON reports(lat, lng);

-- ============================================================
-- PHASE 1: Tasks (field workflow)
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  assigned_to TEXT,
  unit_id TEXT,
  instructions TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','in_progress','completed','rejected','pending_clarification')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  worker_id TEXT,
  accepted_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  progress_percent INTEGER DEFAULT 0,
  progress_notes TEXT,
  estimated_completion TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by TEXT,
  verified_at TEXT,
  completion_evidence_urls TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON tasks(worker_id);
CREATE INDEX IF NOT EXISTS idx_tasks_report ON tasks(report_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_metadata (
  task_id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN ('survei_verifikasi', 'perbaikan_fisik'))
);

CREATE TABLE IF NOT EXISTS task_visits (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  findings TEXT,
  checklist TEXT,
  photo_urls TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  gps_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_visits_task ON task_visits(task_id);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  items TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category_id, version)
);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_category ON checklist_templates(category_id);

-- ============================================================
-- PHASE 1: AI Agent System
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_assessments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  assessment_kind TEXT NOT NULL DEFAULT 'initial',
  assessment_status TEXT NOT NULL CHECK (assessment_status IN ('completed','timeout','parse_failed','vlm_error','failed','pending_retry','dead_letter')),
  confidence REAL CHECK (confidence BETWEEN 0 AND 1),
  model_version TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rule_version TEXT,
  idempotency_key TEXT,
  supporting_factors TEXT DEFAULT '[]',
  risk_factors TEXT DEFAULT '[]',
  correlation_ids TEXT DEFAULT '[]',
  result TEXT DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_report ON agent_assessments(report_id);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_idempotency ON agent_assessments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_retry ON agent_assessments(retry_count, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_created ON agent_assessments(created_at DESC);

CREATE TABLE IF NOT EXISTS failed_assessments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  tool_name TEXT,
  error TEXT,
  failed_at TEXT DEFAULT (datetime('now')),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  permanent_dlq INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_failed_assessments_report ON failed_assessments(report_id);
CREATE INDEX IF NOT EXISTS idx_failed_assessments_permanent ON failed_assessments(permanent_dlq);

-- ============================================================
-- PHASE 1: Report Supporting Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS reopen_requests (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reopen_requests_report ON reopen_requests(report_id);
CREATE INDEX IF NOT EXISTS idx_reopen_requests_status ON reopen_requests(status);

CREATE TABLE IF NOT EXISTS report_status_history (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  status TEXT NOT NULL,
  label TEXT NOT NULL,
  actor TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_report_status_history_report ON report_status_history(report_id);
CREATE INDEX IF NOT EXISTS idx_report_status_history_occurred ON report_status_history(occurred_at);

-- ============================================================
-- PHASE 1: Audit & Logging
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  before_data TEXT,
  after_data TEXT,
  reason TEXT,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_role_created ON audit_log(actor_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_object_type_id ON audit_log(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_object ON audit_log(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at DESC);

-- ============================================================
-- PHASE 1: Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('status_change','ai_assessment','assignment','system','task_completed','report_resolved','report_escalated','report_assigned','needs_completion','out_of_scope','admin_alert','task_assigned','completion_approved','completion_rejected','sanggahan_accepted','sanggahan_rejected')),
  title TEXT NOT NULL,
  body TEXT,
  related_case_id TEXT,
  related_report_id TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_cursor ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_case ON notifications(related_case_id);

-- ============================================================
-- PHASE 1: Case Events & Facility Cards
-- ============================================================

CREATE TABLE IF NOT EXISTS case_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_case_events_report ON case_events(report_id, occurred_at);

CREATE TABLE IF NOT EXISTS facility_cards (
  id TEXT PRIMARY KEY,
  primary_report_id TEXT NOT NULL,
  category_id TEXT,
  location TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_facility_cards_category ON facility_cards(category_id);
CREATE INDEX IF NOT EXISTS idx_facility_cards_status ON facility_cards(status);

-- ============================================================
-- PHASE 1: Priority Scoring
-- ============================================================

CREATE TABLE IF NOT EXISTS priority_scores (
  report_id TEXT PRIMARY KEY,
  computed_score INT NOT NULL CHECK (computed_score >= 0 AND computed_score <= 100),
  severity_component INT,
  population_component INT,
  vulnerability_component INT,
  override_score INT,
  override_reason TEXT,
  override_by TEXT,
  override_at TEXT,
  computed_at TEXT DEFAULT (datetime('now')),
  config_version INT NOT NULL DEFAULT 1,
  sla_component INT,
  report_count_component INT
);
CREATE INDEX IF NOT EXISTS idx_priority_scores_value ON priority_scores(computed_score DESC);
CREATE INDEX IF NOT EXISTS idx_priority_scores_report_computed ON priority_scores(report_id, computed_at);

CREATE TABLE IF NOT EXISTS priority_formula_versions (
  id TEXT PRIMARY KEY,
  version INTEGER UNIQUE NOT NULL,
  weights TEXT NOT NULL DEFAULT '{"severity": 0.4, "impact": 0.25, "vulnerability": 0.2, "sla": 0.15}',
  is_active INTEGER DEFAULT 0,
  activated_at TEXT,
  activated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_priority_versions_active ON priority_formula_versions(is_active);

-- ============================================================
-- PHASE 1: SLA Rules
-- ============================================================

CREATE TABLE IF NOT EXISTS sla_rules (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  prioritas TEXT NOT NULL CHECK (prioritas IN ('rendah','sedang','tinggi','kritis')),
  jam INTEGER NOT NULL CHECK (jam > 0),
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sla_rules_kategori ON sla_rules(kategori_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_rules_unique ON sla_rules(kategori_id, prioritas);

-- ============================================================
-- PHASE 1: Consent (GDPR)
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  purpose TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_records_user ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_device ON consent_records(device_id);

-- ============================================================
-- PHASE 1: Task Workflow
-- ============================================================

CREATE TABLE IF NOT EXISTS task_clarifications (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  message TEXT NOT NULL,
  is_rejection INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_clarifications_task ON task_clarifications(task_id);

CREATE TABLE IF NOT EXISTS task_evidence (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  photo_urls TEXT DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_evidence_task ON task_evidence(task_id);

CREATE TABLE IF NOT EXISTS device_sync_status (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  total_count INTEGER NOT NULL CHECK(total_count >= 0),
  pending_count INTEGER NOT NULL CHECK(pending_count >= 0 AND pending_count <= total_count),
  failed_count INTEGER NOT NULL CHECK(failed_count >= 0 AND failed_count <= pending_count),
  observed_at TEXT NOT NULL,
  PRIMARY KEY(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,transport TEXT NOT NULL CHECK(transport IN ('web','fcm')),
 endpoint TEXT,keys_json TEXT,device_id TEXT,token TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),
 UNIQUE(user_id,endpoint),UNIQUE(user_id,device_id)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_deliveries (
 id TEXT PRIMARY KEY,notification_id TEXT NOT NULL,subscription_id TEXT NOT NULL,status TEXT NOT NULL,
 error_code TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_outbox (
 notification_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,report_id TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL DEFAULT(datetime('now')),
 locked_until TEXT,status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TRIGGER IF NOT EXISTS notifications_enqueue_push AFTER INSERT ON notifications BEGIN
 INSERT OR IGNORE INTO push_outbox(notification_id,user_id,report_id) VALUES(NEW.id,NEW.user_id,NEW.related_report_id);
END;
