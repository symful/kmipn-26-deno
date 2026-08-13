import pg from "pg";

const { Client } = pg;

const POSTGRESQL_URI = process.env.POSTGRESQL_URI!;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const clientConfig: pg.ClientConfig = {
    connectionString: POSTGRESQL_URI,
  };
  const isSsl = POSTGRESQL_URI.startsWith("postgres://") || POSTGRESQL_URI.startsWith("postgresql://");
  if (isSsl) {
    (clientConfig as any).ssl = { rejectUnauthorized: false };
  }
  const client = new Client(clientConfig);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("=== Audit Log Smoke Test ===\n");

  await withClient(async (client) => {
    const testActorId = "00000000-0000-0000-0000-000000000001";
    const testAction = "test_action";

    console.log("1. Verifying audit_log table schema...");
    const schemaResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'audit_log'
      ORDER BY ordinal_position
    `);
    const columns = schemaResult.rows;
    console.log(`   Found ${columns.length} columns:`);
    for (const col of columns) {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    }

    const requiredCols = ["actor", "actor_role", "action", "object_type", "object_id", "before_data", "after_data", "reason", "prev_hash", "entry_hash", "created_at"];
    for (const rc of requiredCols) {
      if (!columns.find(c => c.column_name === rc)) {
        console.error(`   MISSING column: ${rc}`);
        process.exit(1);
      }
    }
    console.log("   Schema OK\n");

    console.log("2. Inserting smoke test audit row...");
    const insertResult = await client.query(`
      INSERT INTO audit_log (actor, actor_role, action, object_type, object_id, before_data, after_data, reason, prev_hash, entry_hash)
      VALUES ($1, 'ADMIN', $2, 'test_object', '00000000-0000-0000-0000-000000000001', '{}', '{}', 'smoke test', '0', '0')
      RETURNING id, actor, actor_role, action, object_type, object_id, prev_hash, entry_hash, created_at
    `, [testActorId, testAction]);

    const row = insertResult.rows[0];
    console.log(`   Inserted: id=${row.id}, actor=${row.actor}, action=${row.action}`);
    if (row.actor !== testActorId) {
      console.error(`   ERROR: actor mismatch. Expected ${testActorId}, got ${row.actor}`);
      process.exit(1);
    }
    console.log("   Insert OK\n");

    console.log("3. Verifying row can be selected with actor column...");
    const selectResult = await client.query("SELECT actor, action, object_type, prev_hash, entry_hash FROM audit_log WHERE actor = $1", [testActorId]);
    if (selectResult.rows.length === 0) {
      console.error("   ERROR: Could not select inserted row");
      process.exit(1);
    }
    console.log(`   Selected ${selectResult.rows.length} row(s) - OK\n`);

    console.log("4. Cleaning up smoke test row...");
    await client.query("DELETE FROM audit_log WHERE id = $1", [row.id]);
    console.log("   Deleted OK\n");

    console.log("=== All audit smoke tests PASSED ===");
  });

  process.exit(0);
}

main().catch((e) => {
  console.error("Audit smoke test failed:", e);
  process.exit(1);
});
