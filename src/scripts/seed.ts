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
    "INSERT INTO wilayah (level, name) VALUES ('PROVINSI', 'SEED-Jawa Barat') RETURNING id"
  );
  const provId = provR.rows[0].id;
  const kabR = await c.query(
    "INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'KABUPATEN', 'SEED-Bandung') RETURNING id",
    [provId]
  );
  const kabId = kabR.rows[0].id;
  const kecR = await c.query(
    "INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'KECAMATAN', 'SEED-Cimenyan') RETURNING id",
    [kabId]
  );
  const kecId = kecR.rows[0].id;
  const desR = await c.query(
    "INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'DESA', 'SEED-Ciburial') RETURNING id",
    [kecId]
  );
  const desaId = desR.rows[0].id;
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

  await c.query(
    `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at)
     VALUES ($1, (SELECT id FROM categories WHERE slug='jalan_rusak'), 'SEED: Jalan rusak parah dekat pasar', ST_SetSRID(ST_MakePoint(107.61, -6.86), 4326)::geometry, ST_SetSRID(ST_MakePoint(107.61, -6.86), 4326)::geography, -6.86, 107.61, '{}', 'submitted', NOW(), NOW())`,
    [report1Key]
  );
  await c.query(
    `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at)
     VALUES ($1, (SELECT id FROM categories WHERE slug='jalan_rusak'), 'SEED: Lubang besar di jalan utama', ST_SetSRID(ST_MakePoint(107.6101, -6.8601), 4326)::geometry, ST_SetSRID(ST_MakePoint(107.6101, -6.8601), 4326)::geography, -6.8601, 107.6101, '{}', 'submitted', NOW(), NOW())`,
    [report2Key]
  );
  await c.query(
    `INSERT INTO reports (idempotency_key, category_id, description, geom, location, lat, lng, photo_urls, status, created_at, updated_at)
     VALUES ($1, (SELECT id FROM categories WHERE slug='jembatan_rusak'), 'SEED: Jembatan gantung putus', ST_SetSRID(ST_MakePoint(107.70, -6.90), 4326)::geometry, ST_SetSRID(ST_MakePoint(107.70, -6.90), 4326)::geography, -6.90, 107.70, '{}', 'submitted', NOW(), NOW())`,
    [report3Key]
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
