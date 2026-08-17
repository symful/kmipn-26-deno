import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

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
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    console.log("No migration files found");
    return;
  }

  console.log(`Found ${migrationFiles.length} migration(s): ${migrationFiles.join(", ")}`);

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const file of migrationFiles) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
        console.log(`Applying ${file}...`);
        await client.query(sql);
      }
      await client.query("COMMIT");
      console.log("All migrations applied successfully");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Migration failed");
      console.error(err);
      process.exit(1);
    }
  });
}

main().catch((e) => {
  console.error("Migration runner failed:", e);
  process.exit(1);
});
