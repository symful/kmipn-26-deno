-- Migration: Add WARGA and other roles to existing users table
-- This alters the CHECK constraint on an already-existing users table
-- The initial 000_schema.sql uses CREATE TABLE IF NOT EXISTS which won't modify existing tables

-- Drop the old constraint (was only VERIFIKATOR and ADMIN)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add the new constraint with all roles including WARGA for self-registration
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'VERIFIKATOR',
  'ADMIN',
  'WARGA',
  'SURVEYOR',
  'OPERATOR',
  'PETUGAS',
  'ADMIN_DAERAH',
  'AUDITOR',
  'PENGAMBIL_KEPUTUSAN'
));
