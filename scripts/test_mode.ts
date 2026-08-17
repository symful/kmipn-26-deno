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
    console.log("Test 1: Simple query");
    const t1 = await client.query("SELECT COUNT(*) as cnt FROM reports");
    console.log("reports count:", t1.rows[0].cnt);

    console.log("\nTest 2: Simple MODE query");
    try {
      const t2 = await client.query("SELECT MODE() WITHIN GROUP (ORDER BY status) as mode_status FROM reports");
      console.log("MODE result:", t2.rows[0]);
    } catch (e) {
      console.log("MODE failed:", e.code, e.message);
    }

    console.log("\nTest 3: Query with ST_Centroid and MODE");
    try {
      const t3 = await client.query(`
        SELECT
          ROUND(ST_X(ST_Centroid(kab.geom))::numeric, 4) as lng,
          ROUND(ST_Y(ST_Centroid(kab.geom))::numeric, 4) as lat,
          COUNT(*)::int as count,
          MODE() WITHIN GROUP (ORDER BY r.status) as dominant_status,
          MODE() WITHIN GROUP (ORDER BY c.name) as dominant_category,
          c.id as category_id
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         LEFT JOIN wilayah kab ON kab.level = 'KABUPATEN'
           AND kab.geom IS NOT NULL
           AND ST_Contains(kab.geom, r.geom::geometry)
         WHERE r.status NOT IN ('rejected', 'duplicate_merged')
         GROUP BY ROUND(ST_X(ST_Centroid(kab.geom))::numeric, 4), ROUND(ST_Y(ST_Centroid(kab.geom))::numeric, 4), c.id
         ORDER BY count DESC
         LIMIT 10
      `);
      console.log("Cluster query success! rows:", t3.rows.length);
    } catch (e) {
      console.log("Cluster query failed:", e.code, e.message);
    }
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});