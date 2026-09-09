-- migrations-2026-09-gamification.sql
-- Idempotent apply-once migration for existing remote D1.
-- Safe to run on a database with production data.
-- Tables use IF NOT EXISTS; columns use ALTER TABLE ADD COLUMN (no-op if exists in SQLite < 3.35).

-- ── New tables ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xp_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  contribution_id TEXT NOT NULL,
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('new_report','corroboration','status_changing_update','self_status_changing_update')),
  xp INTEGER NOT NULL CHECK (xp IN (4, 8, 10, -4, -8, -10)),
  kind TEXT NOT NULL DEFAULT 'credit' CHECK (kind IN ('credit','reversal')),
  reason TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_contribution ON xp_ledger (contribution_id);

CREATE TABLE IF NOT EXISTS gamification_profiles (
  user_id TEXT PRIMARY KEY,
  leaderboard_opt_in INTEGER NOT NULL DEFAULT 0,
  abuse_flag INTEGER NOT NULL DEFAULT 0,
  accepted_adjudicated INTEGER NOT NULL DEFAULT 0,
  total_adjudicated INTEGER NOT NULL DEFAULT 0,
  new_report_accepted INTEGER NOT NULL DEFAULT 0,
  corroboration_accepted INTEGER NOT NULL DEFAULT 0,
  status_changing_accepted INTEGER NOT NULL DEFAULT 0,
  xp_reached_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gamification_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  badge_key TEXT NOT NULL CHECK (badge_key IN ('first_accepted','active_contributor','evidence_strength','condition_updater','high_reliability')),
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, badge_key)
);
CREATE INDEX IF NOT EXISTS idx_badges_user ON gamification_badges (user_id);

-- ── New columns on reports ─────────────────────────────────
-- SQLite ALTER TABLE ADD COLUMN is idempotent (no-op if column exists).

ALTER TABLE reports ADD COLUMN contribution_type TEXT CHECK (contribution_type IS NULL OR contribution_type IN ('new_report','corroboration','status_changing_update','duplicate_pure'));
ALTER TABLE reports ADD COLUMN submission_intent TEXT;
ALTER TABLE reports ADD COLUMN related_case_id TEXT;
ALTER TABLE reports ADD COLUMN resolution_source TEXT;
ALTER TABLE reports ADD COLUMN verification_method TEXT;
ALTER TABLE reports ADD COLUMN resolved_at TEXT;
ALTER TABLE reports ADD COLUMN reopened_at TEXT;

-- ── New indexes on reports ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reports_related_case ON reports (related_case_id);
CREATE INDEX IF NOT EXISTS idx_reports_contribution_type ON reports (contribution_type);
