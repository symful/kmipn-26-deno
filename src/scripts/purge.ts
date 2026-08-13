import { Client } from "pg";
import { RETENTION } from "@/config/retention";

const POSTGRESQL_URI = process.env.POSTGRESQL_URI;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

async function main() {
  const c = new Client({
    connectionString: POSTGRESQL_URI,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const cutoffReports = new Date(Date.now() - RETENTION.reports * 24 * 60 * 60 * 1000);
  const result = await c.query(
    "DELETE FROM reports WHERE created_at < $1 RETURNING id",
    [cutoffReports]
  );
  const deletedReports = result.rowCount ?? 0;

  console.log(`Purged ${deletedReports} expired reports (retention: ${RETENTION.reports} days, cutoff: ${cutoffReports.toISOString()})`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
