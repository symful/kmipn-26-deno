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
    const missingCols = [
      { name: "deleted_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ NOT NULL DEFAULT NOW()" },
      { name: "description", type: "TEXT" },
      { name: "code", type: "VARCHAR(10)" },
      { name: "short_code", type: "VARCHAR(5)" },
      { name: "color_class", type: "VARCHAR(20)" },
    ];

    for (const col of missingCols) {
      try {
        await client.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`Added ${col.name}`);
      } catch (e) {
        if (e.code === "42710") {
          console.log(`${col.name} already exists`);
        } else {
          throw e;
        }
      }
    }

    const catRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'categories' ORDER BY ordinal_position"
    );
    console.log("\ncategories columns:", catRes.rows.map(r => r.column_name).join(", "));
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});