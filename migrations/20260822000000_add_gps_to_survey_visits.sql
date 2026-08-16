-- Add gps_data column to survey_visits for structured GPS coordinates
ALTER TABLE survey_visits ADD COLUMN IF NOT EXISTS gps_data JSONB;
