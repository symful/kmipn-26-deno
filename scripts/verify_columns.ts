import pg from "pg";

const { Client } = pg;

const POSTGRESQL_URI = (process.env.POSTGRESQL_URI ?? "postgres://avnadmin:AVNS_zYXP5sfojeK2ftRFnnv@kmipn-26-kmipn-26.e.aivencloud.com:11685/defaultdb?sslmode=require&uselibpqcompat=true") as string;

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
  await withClient(async (client) => {
    const r = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'reports'
        AND column_name IN ('reported_at', 'title', 'wilayah_id')
      ORDER BY ordinal_position
    `);
    console.log("reports columns:");
    for (const row of r.rows) {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    }

    const outboxR = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'outbox'
        AND column_name = 'event_type'
    `);
    console.log("\noutbox event_type column:");
    for (const row of outboxR.rows) {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    }

    const auditR = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audit_log'
        AND column_name IN ('actor', 'prev_hash', 'entry_hash')
    `);
    console.log("\naudit_log key columns:");
    for (const row of auditR.rows) {
      console.log(`  ${row.column_name}`);
    }
  });
}

main().catch(console.error);
