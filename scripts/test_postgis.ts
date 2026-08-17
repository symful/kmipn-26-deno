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
    console.log("Testing simple query...");
    const simpleRes = await client.query("SELECT COUNT(*) as cnt FROM reports");
    console.log("reports count:", simpleRes.rows[0].cnt);

    console.log("\nTesting geom column type...");
    const geomRes = await client.query(`
      SELECT geom, ST_Contains(ST_MakeEnvelope(95, -10, 145, 5, 4326), geom) as contained
      FROM reports
      LIMIT 1
    `);
    console.log("Sample geom result:", geomRes.rows[0]);

    console.log("\nTesting PostGIS extension...");
    const extRes = await client.query("SELECT extname FROM pg_extension WHERE extname = 'postgis'");
    console.log("PostGIS installed:", extRes.rows.length > 0);
  } catch (e) {
    console.error("Error:", e.code, e.message);
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});