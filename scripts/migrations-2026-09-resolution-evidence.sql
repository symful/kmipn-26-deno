-- 2026-09: admin after-photos stored separately from petugas field evidence.
ALTER TABLE tasks ADD COLUMN resolution_evidence_urls TEXT;
ALTER TABLE task_evidence ADD COLUMN role TEXT NOT NULL DEFAULT 'field';
