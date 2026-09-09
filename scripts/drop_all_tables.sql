-- drop_all_tables.sql — Drop ALL application tables from D1
-- Usage: npx wrangler d1 execute kmipn-26-deno --remote --file=scripts/drop_all_tables.sql

-- Foreign key dependencies: drop children first
DROP TABLE IF EXISTS push_outbox;
DROP TABLE IF EXISTS push_deliveries;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS device_sync_status;
DROP TABLE IF EXISTS task_evidence;
DROP TABLE IF EXISTS task_clarifications;
DROP TABLE IF EXISTS task_visits;
DROP TABLE IF EXISTS task_metadata;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS report_status_history;
DROP TABLE IF EXISTS reopen_requests;
DROP TABLE IF EXISTS agent_assessments;
DROP TABLE IF EXISTS failed_assessments;
DROP TABLE IF EXISTS priority_scores;
DROP TABLE IF EXISTS facility_cards;
DROP TABLE IF EXISTS case_events;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS consent_records;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS checklist_templates;
DROP TABLE IF EXISTS sla_rules;
DROP TABLE IF EXISTS priority_formula_versions;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS gamification_badges;
DROP TABLE IF EXISTS gamification_profiles;
DROP TABLE IF EXISTS xp_ledger;
DROP TABLE IF EXISTS revoked_tokens;
DROP TABLE IF EXISTS users;
