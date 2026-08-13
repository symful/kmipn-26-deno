import pg from "pg";
const { Client } = pg;
import bcrypt from "bcryptjs";

const POSTGRESQL_URI = process.env.POSTGRESQL_URI;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

// Tables to truncate (everything except categories and wilayah)
const TABLES_TO_TRUNCATE = [
  "audit_log",
  "ai_call_log",
  "outbox",
  "outbox_reconciliations",
  "agent_assessments",
  "reports",
  "report_shares",
  "report_retention_policy",
  "case_events",
  "consent_records",
  "consent_retry_queue",
  "facility_cards",
  "notifications",
  "revoked_tokens",
  "refresh_tokens",
  "priority_config",
  "priority_formula_versions",
  "priority_scores",
  "sla_rules",
  "surveyor_tasks",
  "survey_visits",
  "units",
  "unit_members",
  "sync_outcomes",
  "webhook_idempotency",
  "webhook_dead_letter",
  "users",
];

async function main() {
  const c = new Client({
    connectionString: POSTGRESQL_URI,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log("Connected to database");

  // Truncate all operational tables
  console.log("Truncating operational tables...");
  for (const table of TABLES_TO_TRUNCATE) {
    try {
      await c.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      console.log(`  - ${table}: truncated`);
    } catch (err) {
      console.log(`  - ${table}: skipped (${(err as Error).message})`);
    }
  }

  // Seed 6 accounts
  console.log("\nSeeding accounts...");
  const accounts = [
    { email: "admin@sigap.live", password: "admin123", name: "Admin SIGAP", role: "ADMIN" },
    { email: "verifikator@sigap.live", password: "verifikator123", name: "Verifikator SIGAP", role: "VERIFIKATOR" },
    { email: "operator@sigap.live", password: "operator123", name: "Operator SIGAP", role: "OPERATOR" },
    { email: "surveyor@sigap.live", password: "surveyor123", name: "Surveyor SIGAP", role: "SURVEYOR" },
    { email: "petugas@sigap.live", password: "petugas123", name: "Petugas SIGAP", role: "PETUGAS" },
    { email: "admin_daerah@sigap.live", password: "admin_daerah123", name: "Admin Daerah SIGAP", role: "ADMIN_DAERAH" },
  ];

  for (const acct of accounts) {
    const hash = await bcrypt.hash(acct.password, 12);
    await c.query(
      "INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
      [acct.email, hash, acct.name, acct.role]
    );
    console.log(`  - ${acct.email} (${acct.role})`);
  }

  // Verify counts
  const userCount = await c.query("SELECT COUNT(*) FROM users");
  const catCount = await c.query("SELECT COUNT(*) FROM categories");
  console.log(`\nVerification:`);
  console.log(`  users count: ${userCount.rows[0].count}`);
  console.log(`categories count: ${catCount.rows[0].count}`);

  await c.end();
  console.log("\nSeed complete!");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
