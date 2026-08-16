-- ============================================================
-- SIGAP Schema - Consolidated Migration
-- All migrations merged in dependency order
-- Idempotent: uses CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
-- ============================================================

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- PHASE 0: Base tables (from initial_schema)
-- ============================================================

-- Users (VERIFIKATOR + ADMIN; WARGA is anonymous, no user row)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('VERIFIKATOR', 'ADMIN')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Categories (Jalan Rusak, Jembatan Rusak, etc.)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wilayah (villages - hierarchical)
CREATE TABLE IF NOT EXISTS wilayah (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES wilayah(id),
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('PROVINSI', 'KABUPATEN', 'KECAMATAN', 'DESA')),
  geom GEOMETRY(MultiPolygon, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wilayah_parent ON wilayah(parent_id);
CREATE INDEX IF NOT EXISTS idx_wilayah_geom ON wilayah USING GIST(geom);

-- Reports (citizen reports)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID UNIQUE NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id),
  description TEXT NOT NULL,
  geom GEOMETRY(Point, 4326) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  exif_data JSONB,
  device_id UUID,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected', 'merged', 'separated', 'duplicate_merged', 'needs_survey')),
  severity INT CHECK (severity IS NULL OR (severity >= 0 AND severity <= 100)),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rt_rw_verdict TEXT,
  rt_rw_reason TEXT,
  rt_rw_at TIMESTAMPTZ,
  merged_into UUID,
  separated_into UUID,
  rejection_reason TEXT,
  deadline TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  rt_rw_token_used_at TIMESTAMPTZ,
  population_affected INT DEFAULT 0,
  vulnerability_index NUMERIC(3,2) DEFAULT 0.5,
  wilayah_id UUID REFERENCES wilayah(id),
  ai_recommended_status TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT,
  facility_card_id UUID,
  facility_card JSONB,
  priority SMALLINT CHECK (priority IS NULL OR (priority BETWEEN 1 AND 5)),
  location GEOGRAPHY(Point, 4326)
);
CREATE INDEX IF NOT EXISTS idx_reports_geom ON reports USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category_id);
CREATE INDEX IF NOT EXISTS idx_reports_idempotency ON reports(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_wilayah ON reports(wilayah_id);
CREATE INDEX IF NOT EXISTS idx_reports_verified_at ON reports(verified_at) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_deadline ON reports(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority) WHERE priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_vulnerability_index ON reports(vulnerability_index) WHERE vulnerability_index IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_reported_at ON reports(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_facility_card_id ON reports(facility_card_id);
CREATE INDEX IF NOT EXISTS idx_reports_location ON reports USING GIST(location);

-- AI Agent Assessments (the keunikan)
CREATE TABLE IF NOT EXISTS agent_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  assessment_kind TEXT NOT NULL DEFAULT 'initial',
  assessment_status TEXT NOT NULL CHECK (assessment_status IN ('completed', 'timeout', 'parse_failed', 'vlm_error')),
  vision_description TEXT,
  damage_severity SMALLINT CHECK (damage_severity BETWEEN 1 AND 5),
  exif_summary JSONB,
  duplicate_candidates JSONB,
  confidence REAL CHECK (confidence BETWEEN 0 AND 1),
  recommended_status TEXT,
  tool_calls_made SMALLINT,
  latency_ms INTEGER,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rule_version TEXT,
  idempotency_key TEXT,
  supporting_factors TEXT[] DEFAULT '{}',
  risk_factors TEXT[] DEFAULT '{}',
  correlation_ids TEXT[] DEFAULT '{}',
  result JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (report_id, assessment_kind)
);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_report ON agent_assessments(report_id);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_idempotency ON agent_assessments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_assessments_retry ON agent_assessments(retry_count, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_agent_assessments_created ON agent_assessments(created_at DESC);

-- AI Call Log (cost tracking)
CREATE TABLE IF NOT EXISTS ai_call_log (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_created ON ai_call_log(created_at DESC);

-- ============================================================
-- PHASE 2: Surveyor tasks (from phase2_tables)
-- ============================================================

-- Surveyor task tables
CREATE TABLE IF NOT EXISTS surveyor_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id),
  surveyor_id UUID NOT NULL REFERENCES users(id),
  instructions TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('assigned', 'in_progress', 'completed', 'rejected')) DEFAULT 'assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES surveyor_tasks(id),
  surveyor_id UUID NOT NULL REFERENCES users(id),
  findings TEXT,
  checklist JSONB,
  photo_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveyor_tasks_surveyor ON surveyor_tasks(surveyor_id, status);

-- ============================================================
-- PHASE 3: Outbox table (from phase3_outbox)
-- ============================================================

CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_system TEXT NOT NULL CHECK (target_system IN ('sipd', 'satu_data', 'bps')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'dead_letter', 'skipped')) DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  related_report_id UUID REFERENCES reports(id),
  event_type TEXT NOT NULL DEFAULT 'unknown',
  next_retry_at TIMESTAMPTZ,
  max_retries INT DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_related_report ON outbox(related_report_id);

-- ============================================================
-- PHASE 2 RECONCILE: audit_log reconstruction (from phase2_schema_reconcile)
-- ============================================================

DROP TABLE IF EXISTS audit_log CASCADE;
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  before JSONB,
  after JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_role_created ON audit_log(actor_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_object_type_id ON audit_log(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_object ON audit_log(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at DESC);

-- ============================================================
-- COLUMNS: users.wilayah_id (from phase2_tables)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'wilayah_id'
  ) THEN
    ALTER TABLE users ADD COLUMN wilayah_id UUID REFERENCES wilayah(id);
  END IF;
END $$;

-- ============================================================
-- TABLES: notifications (from notifications)
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('status_change', 'ai_assessment', 'assignment', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  related_report_id UUID REFERENCES reports(id),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_cursor ON notifications(user_id, created_at DESC);

-- ============================================================
-- TABLES: sync_outcomes (from sync_outcomes)
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  accepted_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_outcomes_created ON sync_outcomes(created_at DESC);

-- ============================================================
-- COLUMNS: outbox.event_type + constraint (from outbox_event_type + outbox_event_type_required)
-- ============================================================

-- Backfill event_type from payload.action
UPDATE outbox SET event_type = COALESCE(payload->>'action', 'unknown') WHERE event_type = 'unknown';

-- CHECK constraint for event_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbox_event_type_check') THEN
    ALTER TABLE outbox ADD CONSTRAINT outbox_event_type_check
      CHECK (event_type IN (
        'report_created',
        'report_assigned',
        'report_closed',
        'report_escalated',
        'survey_completed',
        'verifikator_accept',
        'verifikator_reject',
        'verifikator_combine',
        'verifikator_separate',
        'operator_resolve',
        'operator_assign',
        'operator_escalate',
        'unknown'
      ));
  END IF;
END $$;

-- ============================================================
-- COLUMNS: outbox retry tracking (from outbox_retry)
-- ============================================================

-- Backfill next_retry_at for existing pending rows
UPDATE outbox SET next_retry_at = NOW() WHERE next_retry_at IS NULL AND status = 'pending';

-- ============================================================
-- TABLES: revoked_tokens (from revoked_tokens)
-- ============================================================

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti UUID PRIMARY KEY,
  revoked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- ============================================================
-- TABLES: priority_config + priority_scores (from priority_scoring)
-- ============================================================

CREATE TABLE IF NOT EXISTS priority_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL DEFAULT 1,
  severity_weight NUMERIC(3,2) NOT NULL DEFAULT 0.40,
  population_weight NUMERIC(3,2) NOT NULL DEFAULT 0.30,
  vulnerability_weight NUMERIC(3,2) NOT NULL DEFAULT 0.30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  sla_pressure_weight NUMERIC(3,2) NOT NULL DEFAULT 0.00
);

ALTER TABLE priority_config ADD CONSTRAINT check_weights_non_negative
CHECK (severity_weight >= 0 AND population_weight >= 0 AND vulnerability_weight >= 0 AND sla_pressure_weight >= 0);

CREATE TABLE IF NOT EXISTS priority_scores (
  report_id UUID PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  computed_score INT NOT NULL CHECK (computed_score >= 0 AND computed_score <= 100),
  severity_component INT,
  population_component INT,
  vulnerability_component INT,
  override_score INT,
  override_reason TEXT,
  override_by UUID REFERENCES users(id),
  override_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  config_version INT NOT NULL DEFAULT 1,
  sla_component INT
);
CREATE INDEX IF NOT EXISTS idx_priority_scores_value ON priority_scores(computed_score DESC);

-- ============================================================
-- COLUMNS: categories.parent_id (from subcategory)
-- ============================================================

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ============================================================
-- COLUMNS: categories.code, short_code, color_class (for UI rendering)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'code'
  ) THEN
    ALTER TABLE categories ADD COLUMN code TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'short_code'
  ) THEN
    ALTER TABLE categories ADD COLUMN short_code TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'color_class'
  ) THEN
    ALTER TABLE categories ADD COLUMN color_class TEXT;
  END IF;
END $$;

-- ============================================================
-- TABLES: report_shares (from report_shares)
-- ============================================================

CREATE TABLE IF NOT EXISTS report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  share_token UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_shares_token ON report_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_report_shares_report ON report_shares(report_id);

-- ============================================================
-- TABLES: sla_rules (from 20260813000001_add_sla_rules)
-- ============================================================

CREATE TABLE IF NOT EXISTS sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kategori_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  prioritas VARCHAR(20) NOT NULL CHECK (prioritas IN ('rendah', 'sedang', 'tinggi', 'kritis')),
  jam INTEGER NOT NULL CHECK (jam > 0),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sla_rules_kategori ON sla_rules(kategori_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_rules_unique ON sla_rules(kategori_id, prioritas) WHERE is_active = true;

-- ============================================================
-- TABLES: units (from 20260813000003_add_units - newer version)
-- ============================================================

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama VARCHAR(255) NOT NULL,
  wilayah_id UUID NOT NULL REFERENCES wilayah(id) ON DELETE CASCADE,
  alamat TEXT,
  kontak VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_units_wilayah ON units(wilayah_id);
CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

-- ============================================================
-- TABLES: unit_members (from 20260813000003_add_units)
-- ============================================================

CREATE TABLE IF NOT EXISTS unit_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('KEPALA_UNIT', 'ANGGOTA')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unit_members_unit ON unit_members(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_members_user ON unit_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_members_unique ON unit_members(unit_id, user_id) WHERE deleted_at IS NULL;

-- ============================================================
-- TABLES: webhook_idempotency + webhook_dead_letter (from webhook_idempotency_and_dlq)
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_idempotency (
  key TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_processed ON webhook_idempotency(processed_at);

CREATE TABLE IF NOT EXISTS webhook_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT,
  source TEXT,
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_dead_letter_idem_key ON webhook_dead_letter(idempotency_key);

-- ============================================================
-- TABLES: consent_records (from consent_records)
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  device_id TEXT,
  purpose TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_records_user ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_device ON consent_records(device_id);

-- ============================================================
-- TABLES: case_events (from case_events)
-- ============================================================

CREATE TABLE IF NOT EXISTS case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_case_events_report ON case_events(report_id, occurred_at);

-- ============================================================
-- TABLES: facility_cards (from facility_cards)
-- ============================================================

CREATE TABLE IF NOT EXISTS facility_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_report_id UUID NOT NULL REFERENCES reports(id),
  category_id UUID REFERENCES categories(id),
  location GEOGRAPHY(POINT, 4326),
  canonical_name TEXT,
  photo_keys TEXT[],
  severity INTEGER,
  urgency_score NUMERIC,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_facility_cards_location ON facility_cards USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_facility_cards_category ON facility_cards(category_id);
CREATE INDEX IF NOT EXISTS idx_facility_cards_status ON facility_cards(status);

-- ============================================================
-- TABLES: surveyor_checklist_templates (from surveyor_checklist_templates)
-- ============================================================

CREATE TABLE IF NOT EXISTS surveyor_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id),
  version INTEGER NOT NULL DEFAULT 1,
  items JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, version)
);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_category ON surveyor_checklist_templates(category_id);

-- ============================================================
-- TABLES: priority_formula_versions (from priority_formula_versions)
-- ============================================================

CREATE TABLE IF NOT EXISTS priority_formula_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER UNIQUE NOT NULL,
  weights JSONB NOT NULL DEFAULT '{"severity": 0.4, "impact": 0.25, "vulnerability": 0.2, "sla": 0.15}',
  is_active BOOLEAN DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_priority_versions_active ON priority_formula_versions(is_active) WHERE is_active = TRUE;

-- ============================================================
-- TABLES: outbox_reconciliations (from outbox_reconciliation)
-- ============================================================

CREATE TABLE IF NOT EXISTS outbox_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES outbox(id),
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_by UUID REFERENCES users(id),
  action TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_reconciliations_outbox ON outbox_reconciliations(outbox_id);

-- ============================================================
-- TABLES: report_retention_policy (from report_retention_policy)
-- ============================================================

CREATE TABLE IF NOT EXISTS report_retention_policy (
  id SERIAL PRIMARY KEY,
  kategori TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 2555,
  enabled BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABLES: consent_retry_queue (from consent_retry_queue)
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  device_id TEXT,
  purpose TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'dead_letter')),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_consent_retry_queue_status ON consent_retry_queue(status, created_at);

-- ============================================================
-- ALTER: agent_assessments idempotency UNIQUE constraint (from unique_assessment_idempotency)
-- ============================================================

ALTER TABLE agent_assessments
  ADD CONSTRAINT agent_assessments_idempotency_key_unique UNIQUE (idempotency_key);

-- Drop the partial index (now redundant with the constraint)
DROP INDEX IF EXISTS idx_agent_assessments_idempotency;

-- ============================================================
-- INDEXES: priority_scores report+computed (from priority_scores_report_computed_index)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_priority_scores_report_computed
  ON priority_scores(report_id, computed_at);

-- ============================================================
-- BACKFILL: outbox event_type (from outbox_event_type)
-- ============================================================

UPDATE outbox SET event_type = COALESCE(payload->>'action', 'unknown') WHERE event_type = 'unknown';

-- ============================================================
-- BACKFILL: priority_scores config_version (from priority_scores_phase3)
-- ============================================================

UPDATE priority_scores ps
SET config_version = (
  SELECT COALESCE(pc.version, 1)
  FROM priority_config pc
  WHERE pc.is_active = true
  LIMIT 1
)
WHERE config_version IS NULL;

UPDATE priority_scores
SET config_version = 1
WHERE config_version IS NULL;

-- ============================================================
-- BACKFILL: agent_assessments dedup (from unique_assessment_idempotency)
-- ============================================================

DELETE FROM agent_assessments a1
USING agent_assessments a2
WHERE a1.idempotency_key = a2.idempotency_key
  AND a1.idempotency_key IS NOT NULL
  AND a1.created_at < a2.created_at;

-- ============================================================
-- BACKFILL: reports.wilayah_id from geometry (from wilayah_id_required)
-- ============================================================

INSERT INTO wilayah (id, name, level)
VALUES ('00000000-0000-0000-0000-000000000000', 'Unknown Wilayah', 'DESA')
ON CONFLICT DO NOTHING;

UPDATE reports SET wilayah_id = (
  SELECT w.id FROM wilayah w
  WHERE w.geom IS NOT NULL
    AND ST_Contains(w.geom, reports.location::geometry)
  ORDER BY w.level ASC
  LIMIT 1
)
WHERE wilayah_id IS NULL AND location IS NOT NULL;

UPDATE reports SET wilayah_id = '00000000-0000-0000-0000-000000000000'
WHERE wilayah_id IS NULL;

ALTER TABLE reports ALTER COLUMN wilayah_id SET NOT NULL;

-- ============================================================
-- BACKFILL: reports.location from lng/lat (from phase2_schema_reconcile)
-- ============================================================

UPDATE reports SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE location IS NULL AND lng IS NOT NULL;

-- ============================================================
-- TABLES: report_status_history (for timeline - Wave 3)
-- ============================================================

CREATE TABLE IF NOT EXISTS report_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  label TEXT NOT NULL,
  actor UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_status_history_report ON report_status_history(report_id);
CREATE INDEX IF NOT EXISTS idx_report_status_history_occurred ON report_status_history(occurred_at);

-- ============================================================
-- TABLES: surveyor_task_downloads (for batch download tracking - Wave 3)
-- ============================================================

CREATE TABLE IF NOT EXISTS surveyor_task_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES surveyor_tasks(id) ON DELETE CASCADE,
  downloaded_by UUID NOT NULL REFERENCES users(id),
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_info JSONB DEFAULT '{}',
  UNIQUE(task_id, downloaded_by)
);
CREATE INDEX IF NOT EXISTS idx_surveyor_task_downloads_task ON surveyor_task_downloads(task_id);

-- ============================================================
-- SEED: 9 categories (from initial_schema)
-- ============================================================

INSERT INTO categories (slug, name, icon) VALUES
  ('jalan_rusak', 'Jalan Rusak', 'road'),
  ('jembatan_rusak', 'Jembatan Rusak', 'bridge'),
  ('saluran_air_terhambat', 'Saluran Air Terhambat', 'water'),
  ('listrik_padam', 'Listrik Padam', 'electricity'),
  ('fasilitas_umum_rusak', 'Fasilitas Umum Rusak', 'building'),
  ('penerangan_jalan_rusak', 'Penerangan Jalan Rusak', 'lamp'),
  ('tempat_sampah_penuh', 'Tempat Sampah Penuh', 'trash'),
  ('banjir', 'Banjir', 'flood'),
  ('longsor', 'Longsor', 'landslide')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: default priority_config (from priority_scoring)
-- ============================================================

INSERT INTO priority_config (version, severity_weight, population_weight, vulnerability_weight, is_active)
VALUES (1, 0.40, 0.30, 0.30, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: default report_retention_policy (from report_retention_policy)
-- ============================================================

INSERT INTO report_retention_policy (kategori, retention_days, enabled)
VALUES ('default', 2555, TRUE)
ON CONFLICT DO NOTHING;
