-- ============================================================
-- Missing Tables and Columns Migration
-- Added to address schema gaps identified in code review
-- ============================================================

-- 1. Roles master table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Roles mapping (for multi-role support)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, role_id)
);

-- 3. Task clarifications (referenced in petugas routes)
CREATE TABLE IF NOT EXISTS task_clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES surveyor_tasks(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT,
  is_rejection BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- 4. Task evidence (referenced in petugas routes)
CREATE TABLE IF NOT EXISTS task_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES surveyor_tasks(id) ON DELETE CASCADE,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Task completions (referenced in petugas routes)
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES surveyor_tasks(id) ON DELETE CASCADE,
  completion_proof TEXT,
  summary TEXT NOT NULL,
  completed_by UUID NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  notes TEXT
);

-- 6. SLA changes audit (referenced in operator routes)
CREATE TABLE IF NOT EXISTS sla_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  previous_deadline TIMESTAMPTZ,
  new_deadline TIMESTAMPTZ NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Escalations (referenced in operator routes)
CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  escalated_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  previous_severity TEXT,
  new_severity TEXT,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Reopen requests (referenced in warga routes)
CREATE TABLE IF NOT EXISTS reopen_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
);

-- 9. System logs (referenced in auditor routes)
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Failed assessments (referenced in agent orchestrator)
CREATE TABLE IF NOT EXISTS failed_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  error TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INT DEFAULT 0,
  last_error TEXT,
  permanent_dlq BOOLEAN DEFAULT FALSE,
  next_retry_at TIMESTAMPTZ
);

-- 11. Sync KPI (referenced in admin routes)
CREATE TABLE IF NOT EXISTS sync_kpi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  reports_count INT DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_id, platform)
);

-- ============================================================
-- Missing Columns
-- ============================================================

-- Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Add columns to surveyor_tasks table
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS petugas_id UUID REFERENCES users(id);
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS progress_percent INT DEFAULT 0;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS progress_notes TEXT;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS estimated_completion TIMESTAMPTZ;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS verification_status TEXT;
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE surveyor_tasks ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Add columns to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES users(id);

-- Add population column to wilayah for KPI calculations
ALTER TABLE wilayah ADD COLUMN IF NOT EXISTS population BIGINT DEFAULT 0;
