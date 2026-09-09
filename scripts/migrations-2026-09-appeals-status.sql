-- 2026-09 Option A: appeal_status marks a pending warga objection for queue visibility.
ALTER TABLE reports ADD COLUMN appeal_status TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_appeal ON reports(appeal_status);
