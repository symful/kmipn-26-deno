import pg from "pg";

const { Client } = pg;

const POSTGRESQL_URI = process.env.POSTGRESQL_URI;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

async function main() {
  const url = new URL(POSTGRESQL_URI);
  url.searchParams.set("sslmode", "no-verify");
  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  try {
    const catRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'categories' ORDER BY ordinal_position"
    );
    console.log("categories columns:", catRes.rows.map(r => r.column_name).join(", "));

    const hasDeletedAt = catRes.rows.some(r => r.column_name === 'deleted_at');
    console.log("has deleted_at:", hasDeletedAt);
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});