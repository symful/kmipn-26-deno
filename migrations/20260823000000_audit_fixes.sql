-- ============================================================
-- Audit fixes: task_instructions, hallucinated tables cleanup, facility_cards, webhook tables
-- ============================================================

-- 1. task_instructions: stores per-unit instructions for reports
CREATE TABLE IF NOT EXISTS task_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  unit_id UUID,
  instructions TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Drop hallucinated tables that were never part of schema
DROP TABLE IF EXISTS consent_retry_queue;
DROP TABLE IF EXISTS outbox_reconciliations;
DROP TABLE IF EXISTS sync_outcomes;
DROP TABLE IF EXISTS report_retention_policy;

-- 3. facility_cards: stores facility location and urgency
CREATE TABLE IF NOT EXISTS facility_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  location GEOMETRY(POINT, 4326),
  category_id UUID NOT NULL REFERENCES categories(id),
  urgency_level SMALLINT NOT NULL DEFAULT 0,
  photo_gallery TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. webhook_dead_letter: stores failed webhook payloads for later retry
CREATE TABLE IF NOT EXISTS webhook_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  payload TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. webhook_idempotency: ensures webhook events are processed only once
CREATE TABLE IF NOT EXISTS webhook_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
