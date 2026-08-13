import pg from "pg";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL_PATH = join(__dirname, "..", "migrations", "schema.sql");

const POSTGRESQL_URI = process.env.POSTGRESQL_URI!;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = new URL(POSTGRESQL_URI);
  url.searchParams.set("sslmode", "no-verify");
  const clientConfig: pg.ClientConfig = {
    connectionString: url.toString(),
  };
  const client = new Client(clientConfig);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function main() {
  if (!existsSync(SCHEMA_SQL_PATH)) {
    console.error("schema.sql not found");
    process.exit(1);
  }

  await withClient(async (client) => {
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'categories' AND table_schema = 'public'
    `);

    if (result.rows[0]?.count === "0") {
      console.log("Schema NOT applied");
      process.exit(1);
    }

    const rowCount = await client.query("SELECT COUNT(*) as count FROM categories");
    if (parseInt(rowCount.rows[0]?.count ?? "0", 10) === 0) {
      console.log("Schema NOT applied");
      process.exit(1);
    }

    console.log("Schema applied");
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Migration status check failed:", e);
  process.exit(1);
});
