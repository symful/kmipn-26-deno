import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.POSTGRESQL_URI,
  ssl: {
    rejectUnauthorized: false,
  },
});

const migration = `
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_system TEXT NOT NULL CHECK (target_system IN ('sipd', 'satu_data', 'bps')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  related_report_id UUID REFERENCES reports(id)
);
CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox (status, created_at);
CREATE INDEX IF NOT EXISTS outbox_related_report_idx ON outbox (related_report_id);
`;

async function runMigration() {
  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected!");

    console.log("Running migration...");
    await client.query(migration);
    console.log("Migration completed successfully!");

    const result = await client.query("SELECT tablename FROM pg_tables WHERE tablename = 'outbox'");
    if (result.rows.length > 0) {
      console.log("Verification: outbox table exists!");
    } else {
      console.log("Warning: outbox table not found after migration");
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
