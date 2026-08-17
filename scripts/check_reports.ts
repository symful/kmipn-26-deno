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

    const repRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'reports' ORDER BY ordinal_position"
    );
    console.log("\nreports columns:", repRes.rows.map(r => r.column_name).join(", "));

    const wilRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'wilayah' ORDER BY ordinal_position"
    );
    console.log("\nwilayah columns:", wilRes.rows.map(r => r.column_name).join(", "));

    const hasGeom = repRes.rows.some(r => r.column_name === 'geom');
    const hasReportedAt = repRes.rows.some(r => r.column_name === 'reported_at');
    const hasStatus = repRes.rows.some(r => r.column_name === 'status');
    console.log("\nreports has geom:", hasGeom);
    console.log("reports has reported_at:", hasReportedAt);
    console.log("reports has status:", hasStatus);
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});