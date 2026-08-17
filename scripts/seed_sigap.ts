import pg from "pg";
import bcrypt from "bcryptjs";

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

  console.log("Seeding SIGAP initial data...");

  const categories = [
    { slug: "jalan", name: "Jalan", icon: "road" },
    { slug: "jembatan", name: "Jembatan", icon: "bridge" },
    { slug: "air_bersih", name: "Air Bersih", icon: "droplet" },
    { slug: "drainase", name: "Drainase", icon: "drainage" },
    { slug: "penerangan_jalan", name: "Penerangan Jalan", icon: "lamp" },
    { slug: "fasilitas_kesehatan", name: "Fasilitas Kesehatan", icon: "health" },
    { slug: "fasilitas_pendidikan", name: "Fasilitas Pendidikan", icon: "school" },
    { slug: "lainnya", name: "Lainnya", icon: "more" },
  ];

  for (const cat of categories) {
    await c.query(
      `INSERT INTO categories (slug, name, icon) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING`,
      [cat.slug, cat.name, cat.icon]
    );
  }
  console.log(`Seeded ${categories.length} categories`);

  const users = [
    { email: "admin@sigap.live", password: "admin123", role: "ADMIN", name: "Admin SIGAP" },
    { email: "admin_daerah@sigap.live", password: "admin_daerah123", role: "ADMIN_DAERAH", name: "Admin Daerah" },
    { email: "operator@sigap.live", password: "operator123", role: "OPERATOR", name: "Operator" },
    { email: "petugas@sigap.live", password: "petugas123", role: "PETUGAS", name: "Petugas" },
    { email: "surveyor@sigap.live", password: "surveyor123", role: "SURVEYOR", name: "Surveyor" },
    { email: "verifikator@sigap.live", password: "verifikator123", role: "VERIFIKATOR", name: "Verifikator" },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await c.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
      [u.email, hash, u.role, u.name]
    );
  }
  console.log(`Seeded ${users.length} users`);

  const prov = await c.query(
    `INSERT INTO wilayah (name, level) VALUES ('Jawa Barat', 'PROVINSI') ON CONFLICT DO NOTHING RETURNING id`
  );
  const provId = prov.rows[0]?.id;
  if (!provId) {
    const existing = await c.query(`SELECT id FROM wilayah WHERE name = 'Jawa Barat' AND level = 'PROVINSI'`);
    provId = existing.rows[0]?.id;
  }

  const kab = await c.query(
    `INSERT INTO wilayah (name, level, parent_id) VALUES ('Bandung', 'KABUPATEN', $1) ON CONFLICT DO NOTHING RETURNING id`,
    [provId]
  );
  const kabId = kab.rows[0]?.id;
  if (!kabId) {
    const existing = await c.query(`SELECT id FROM wilayah WHERE name = 'Bandung' AND level = 'KABUPATEN'`);
    kabId = existing.rows[0]?.id;
  }

  const kec = await c.query(
    `INSERT INTO wilayah (name, level, parent_id) VALUES ('Cisarua', 'KECAMATAN', $1) ON CONFLICT DO NOTHING RETURNING id`,
    [kabId]
  );
  const kecId = kec.rows[0]?.id;
  if (!kecId) {
    const existing = await c.query(`SELECT id FROM wilayah WHERE name = 'Cisarua' AND level = 'KECAMATAN'`);
    kecId = existing.rows[0]?.id;
  }

  const desas = ["Ciburuy", "Kaler", "Girang", "Wetan", "Hegarsari", "Sukamanah", "Taman\u667A\u616E", "Puro"];
  for (const desaName of desas) {
    await c.query(
      `INSERT INTO wilayah (name, level, parent_id) VALUES ($1, 'DESA', $2) ON CONFLICT DO NOTHING`,
      [desaName, kecId]
    );
  }
  console.log(`Seeded wilayah: 1 provinsi, 1 kabupaten, 1 kecamatan, ${desas.length} desa`);

  const firstDesa = await c.query(`SELECT id FROM wilayah WHERE name = $1 AND level = 'DESA' LIMIT 1`, [desas[0]]);
  const unitWilayahId = firstDesa.rows[0]?.id ?? kecId;

  await c.query(
    `INSERT INTO units (nama, wilayah_id) VALUES ('Dinas Pekerjaan Umum', $1) ON CONFLICT DO NOTHING`,
    [unitWilayahId]
  );
  console.log("Seeded units: 'Dinas Pekerjaan Umum'");

  console.log("\n=== SIGAP SEED COMPLETE ===");
  await c.end();
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
