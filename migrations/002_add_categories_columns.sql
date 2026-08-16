-- ============================================================
-- Add Missing Columns to Categories Table
-- Idempotent migration - safe to run multiple times
-- ============================================================

ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS code VARCHAR(10);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS short_code VARCHAR(5);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color_class VARCHAR(20);

-- Backfill existing rows with sensible defaults based on slug
UPDATE categories
SET
  code = UPPER(SUBSTRING(slug, 1, 3)),
  short_code = UPPER(SUBSTRING(slug, 1, 2)),
  color_class = 'category-default'
WHERE code IS NULL AND short_code IS NULL AND color_class IS NULL;
