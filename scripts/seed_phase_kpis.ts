import pg from "pg";
const { Client } = pg;

const POSTGRESQL_URI = process.env.POSTGRESQL_URI;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

async function main() {
  const c = new Client({
    connectionString: POSTGRESQL_URI,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log("Seeding KPI phase data...");

  // Clean up existing KPI seed data
  await c.query("DELETE FROM sync_outcomes WHERE batch_id LIKE 'SEED-%'");
  await c.query("DELETE FROM case_events WHERE report_id IN (SELECT id FROM reports WHERE description LIKE 'SEED-KPI:%')");
  await c.query("DELETE FROM reports WHERE description LIKE 'SEED-KPI:%'");

  // Get 5 kabupaten wilayah for diversity with real coordinates and population
  const kabupatens = await c.query(`
    SELECT 
      id, 
      name, 
      COALESCE(ST_X(ST_Centroid(geom)), 107.61) as lng,
      COALESCE(ST_Y(ST_Centroid(geom)), -6.86) as lat,
      COALESCE(population, 0) as population
    FROM wilayah WHERE level = 'KABUPATEN' LIMIT 5
  `);
  const kabList = kabupatens.rows;
  console.log(`Found ${kabList.length} kabupaten for seeding`);

  if (kabList.length === 0) {
    // Fallback: create a dummy kabupaten
    const prov = await c.query(`INSERT INTO wilayah (level, name) VALUES ('PROVINSI', 'Jawa Barat') ON CONFLICT DO NOTHING RETURNING id`);
    const kab = await c.query(`INSERT INTO wilayah (level, name, parent_id) VALUES ('KABUPATEN', 'Bandung', $1) ON CONFLICT DO NOTHING RETURNING id`, [prov.rows[0]?.id]);
    kabList.push(kab.rows[0]);
  }

  // Get categories
  const categories = await c.query(`SELECT id FROM categories LIMIT 3`);
  const catIds = categories.rows.map((r) => r.id);

  // Generate 100 reports across 5 kabupaten with mixed statuses
  const reportIds: string[] = [];
  const statuses = ["submitted", "verified", "in_progress", "resolved", "rejected"];
  const statusWeights = [0.2, 0.25, 0.2, 0.25, 0.1]; // probability weights

  for (let i = 0; i < 100; i++) {
    const kabIdx = i % kabList.length;
    const kabId = kabList[kabIdx]!.id;
    const catId = catIds[i % Math.max(catIds.length, 1)]!;

    const rand = (i * 7) % 100;
    let cumWeight = 0;
    let status = statuses[0]!;
    for (let j = 0; j < statuses.length; j++) {
      cumWeight += statusWeights[j]!;
      if (rand < cumWeight * 100) {
        status = statuses[j]!;
        break;
      }
    }

    const inserted = await c.query<{ id: string }>(
      `INSERT INTO reports (idempotency_key, category_id, description, location, lat, lng, photo_urls, status, created_at, reported_at, title, wilayah_id, population_affected, reporter_id)
       VALUES (gen_random_uuid(), $1, $2, ST_MakePoint($3, $4)::geography, $4, $3, '{}', $5, NOW() - interval '${7 * ((i + 1) % 5)} days', NOW() - interval '${7 * ((i + 2) % 5)} days', $6, $7, $8, gen_random_uuid())
       RETURNING id`,
      [
        catId,
        `SEED-KPI: Laporan ${i + 1}`,
        kabList[kabIdx]!.lng,
        kabList[kabIdx]!.lat,
        status,
        `Laporan KPI ${i + 1}`,
        kabId,
        kabList[kabIdx]!.population,
      ]
    );
    reportIds.push(inserted.rows[0]!.id);
  }
  console.log(`Seeded ${reportIds.length} reports`);

  // Generate case_events for accepted/verified reports
  const verifikatorUser = await c.query(`SELECT id FROM users WHERE role = 'VERIFIKATOR' LIMIT 1`);
  const verifikatorId = verifikatorUser.rows[0]?.id;

  let eventCount = 0;
  for (const reportId of reportIds) {
    const reportStatus = await c.query(`SELECT status FROM reports WHERE id = $1`, [reportId]);
    if (reportStatus.rows[0]?.status === "verified" || reportStatus.rows[0]?.status === "resolved") {
      const reportHash = (reportId.charCodeAt(0) * 31 + reportId.charCodeAt(1) * 7) % 48;
      await c.query(
        `INSERT INTO case_events (report_id, event_type, actor_id, occurred_at)
         VALUES ($1, 'verifikator_accept', $2, NOW() - interval '${7 * ((reportHash + 3) % 5)} hours')`,
        [reportId, verifikatorId ?? null]
      );
      eventCount++;
    }
  }
  console.log(`Seeded ${eventCount} case_events`);

  // Generate sync_outcomes entries
  let batchCount = 0;
  const batchSizes = [5, 10, 15, 20];
  for (let i = 0; i < 20; i++) {
    const batchSize = batchSizes[i % batchSizes.length]!;
    const accepted = Math.floor((70 + (i % 26)) * batchSize / 100);
    const rejected = batchSize - accepted;

    await c.query(
      `INSERT INTO sync_outcomes (batch_id, attempt_count, accepted_count, rejected_count, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW() - interval '${7 * ((i + 4) % 5)} days')`,
      [
        `SEED-batch-${i + 1}`,
        1,
        accepted,
        rejected,
        rejected > 0 ? "Partial sync success" : null,
      ]
    );
    batchCount++;
  }
  console.log(`Seeded ${batchCount} sync_outcomes entries`);

  // Compute and print KPI values
  console.log("\n=== COMPUTED KPI VALUES ===");

  const syncResult = await c.query(`
    SELECT
      COALESCE(SUM(accepted_count), 0)::int AS accepted,
      COALESCE(SUM(rejected_count), 0)::int AS rejected,
      COUNT(*)::int AS batches
    FROM sync_outcomes
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  const syncRow = syncResult.rows[0];
  const totalSync = (syncRow?.accepted ?? 0) + (syncRow?.rejected ?? 0);
  const syncRate = totalSync > 0 ? ((syncRow?.accepted ?? 0) / totalSync * 100) : 0;
  console.log(`sync_success_rate: ${(Math.round(syncRate * 100) / 100).toFixed(2)}%`);
  console.log(`  accepted=${syncRow?.accepted}, rejected=${syncRow?.rejected}, batches=${syncRow?.batches}`);

  const verifResult = await c.query(`
    SELECT
      AVG(EXTRACT(EPOCH FROM (ce.occurred_at - r.created_at)) / 3600)::numeric(10,2) AS avg_hours
    FROM case_events ce
    JOIN reports r ON r.id = ce.report_id
    WHERE ce.event_type = 'verifikator_accept'
      AND ce.occurred_at > NOW() - INTERVAL '30 days'
  `);
  const avgHours = verifResult.rows[0]?.avg_hours ?? 0;
  console.log(`verification_duration: ${Number(avgHours).toFixed(2)} hours avg`);

  const adoptResult = await c.query(`
    SELECT
      COUNT(DISTINCT reporter_id)::int AS active_users,
      COALESCE(SUM(population_affected), 1)::int AS population
    FROM reports
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  const adoptRow = adoptResult.rows[0];
  const activeUsers = adoptRow?.active_users ?? 0;
  const pop = adoptRow?.population ?? 1;
  const adoptRate = Math.round((activeUsers / pop) * 100 * 100) / 100;
  console.log(`adoption_rate: ${adoptRate}%`);
  console.log(`  active_users_30d=${activeUsers}, population=${pop}`);

  console.log("\n=== KPI SEED COMPLETE ===");
  await c.end();
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
