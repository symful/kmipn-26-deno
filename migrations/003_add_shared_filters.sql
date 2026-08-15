-- Migration: 003_add_shared_filters
-- Creates shared_filters table for storing shareable filter configurations

CREATE TABLE IF NOT EXISTS shared_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_data JSONB NOT NULL,
  share_token UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_filters_token ON shared_filters(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_filters_expires ON shared_filters(expires_at);
