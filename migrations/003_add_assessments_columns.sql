-- ============================================================
-- Add Assessments Columns
-- Idempotent migration - safe to run multiple times
-- ============================================================

-- Add agent_version column if it doesn't exist
-- This maps to model_version for API response compatibility
ALTER TABLE agent_assessments ADD COLUMN IF NOT EXISTS agent_version TEXT;

-- Create index for agent_version lookups
CREATE INDEX IF NOT EXISTS idx_agent_assessments_agent_version ON agent_assessments(agent_version) WHERE agent_version IS NOT NULL;

-- Backfill agent_version from model_version where agent_version is null
UPDATE agent_assessments SET agent_version = model_version WHERE agent_version IS NULL AND model_version IS NOT NULL;
