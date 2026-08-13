import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = join(__dirname, "..", "migrations", "schema.sql");

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
  await withClient(async (client) => {
    // Check if schema is already applied by checking if categories table has rows
    const checkResult = await client.query(`
      SELECT 1 FROM categories LIMIT 1
    `);
    const schemaApplied = checkResult.rowCount !== null && checkResult.rowCount > 0;

    if (schemaApplied) {
      console.log("Schema already applied");
      return;
    }

    // Read and apply the schema
    const sql = readFileSync(SCHEMA_FILE, "utf-8");

    console.log("Applying schema...");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
      console.log("Schema applied successfully");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Schema application failed");
      console.error(err);
      process.exit(1);
    }
  });
}

main().catch((e) => {
  console.error("Migration runner failed:", e);
  process.exit(1);
});
