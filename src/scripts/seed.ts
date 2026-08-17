import pg from "pg";
const { Client } = pg;
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

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

  await c.query("DELETE FROM reports WHERE description LIKE 'SEED:%' OR description LIKE 'E2E-TEST-%'");
  await c.query("DELETE FROM users WHERE email LIKE '%@sigap.test'");
  await c.query("DELETE FROM wilayah WHERE name LIKE 'SEED-%'");
  // Categories are seeded by initial_schema.sql; don't delete them here

  const provR = await c.query(
    "INSERT INTO wilayah (level, name) VALUES ('PROVINSI', 'Jawa Barat') ON CONFLICT DO NOTHING RETURNING id"
  );
  let provId = provR.rows[0]?.id;
  if (!provId) {
    const existing = await c.query("SELECT id FROM wilayah WHERE name = 'Jawa Barat' AND level = 'PROVINSI' LIMIT 1");
    provId = existing.rows[0]?.id;
  }
  const kabR = await c.query(
    "INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'KABUPATEN', 'Bandung') ON CONFLICT DO NOTHING RETURNING id",
    [provId]
  );
  let kabId = kabR.rows[0]?.id;
  if (!kabId) {
    const existing = await c.query("SELECT id FROM wilayah WHERE name = 'Bandung' AND level = 'KABUPATEN' LIMIT 1");
    kabId = existing.rows[0]?.id;
  }
  const kecR = await c.query(
    "INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'KECAMATAN', 'Cisarua') ON CONFLICT DO NOTHING RETURNING id",
    [kabId]
  );
  let kecId = kecR.rows[0]?.id;
  if (!kecId) {
    const existing = await c.query("SELECT id FROM wilayah WHERE name = 'Cisarua' AND level = 'KECAMATAN' LIMIT 1");
    kecId = existing.rows[0]?.id;
  }
  const desR = await c.query(
    "INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'DESA', 'Ciburuy') ON CONFLICT DO NOTHING RETURNING id",
    [kecId]
  );
  const desaId = desR.rows[0]?.id ?? kecId;
  console.log("Seeded wilayah hierarchy:", desaId);

  const adminHash = await bcrypt.hash("admin123", 12);
  const verifHash = await bcrypt.hash("verifikator123", 12);
  await c.query(
    "INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, 'Admin SIGAP', 'ADMIN', NOW(), NOW())",
    ["admin@sigap.test", adminHash]
  );
  await c.query(
    "INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, 'Verifikator SIGAP', 'VERIFIKATOR', NOW(), NOW())",
    ["verifikator@sigap.test", verifHash]
  );
  console.log("Seeded 2 users");

  const report1Key = crypto.randomUUID();
  const report2Key = crypto.randomUUID();
  const report3Key = crypto.randomUUID();

  // Get centroid of real Ciburuy DESA for realistic report coordinates
  const centroidRow = await c.query(`
    SELECT
      COALESCE(ST_X(ST_Centroid(geom)), 107.555)::float AS lng,
      COALESCE(ST_Y(ST_Centroid(geom)), -6.830)::float AS lat
    FROM wilayah WHERE name = 'Ciburuy' AND level = 'DESA' LIMIT 1
  `);
  const lng = centroidRow.rows[0]?.lng ?? 107.555;
  const lat = centroidRow.rows[0]?.lat ?? -6.830;
  const lng2 = lng + 0.01;
  const lat2 = lat + 0.01;
  const lng3 = lng + 0.05;
  const lat3 = lat - 0.02;

  await c.query(
    `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at)
     VALUES ($1, (SELECT id FROM categories WHERE slug='jalan_rusak'), 'SEED: Jalan rusak parah dekat pasar', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $3, $2, '{}', 'submitted', NOW(), NOW())`,
    [report1Key, lng, lat]
  );
  await c.query(
    `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at)
     VALUES ($1, (SELECT id FROM categories WHERE slug='jalan_rusak'), 'SEED: Lubang besar di jalan utama', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $3, $2, '{}', 'submitted', NOW(), NOW())`,
    [report2Key, lng2, lat2]
  );
  await c.query(
    `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at)
     VALUES ($1, (SELECT id FROM categories WHERE slug='jembatan_rusak'), 'SEED: Jembatan gantung putus', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $3, $2, '{}', 'submitted', NOW(), NOW())`,
    [report3Key, lng3, lat3]
  );
  console.log("Seeded 3 reports");

  await c.query(
    `INSERT INTO priority_formula_versions (version, weights, is_active, activated_at)
     VALUES (1, '{"severity": 0.4, "impact": 0.25, "vulnerability": 0.2, "sla": 0.15}', true, NOW())
     ON CONFLICT DO NOTHING`
  );
  console.log("Seeded priority_formula_versions v1");

  await c.end();
  console.log("Seed complete");
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
