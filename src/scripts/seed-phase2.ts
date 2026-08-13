import pg from "pg";
import bcrypt from "bcryptjs";
const { Client } = pg;

const POSTGRESQL_URI = process.env.POSTGRESQL_URI;
if (!POSTGRESQL_URI) { console.error("POSTGRESQL_URI not set"); process.exit(1); }

async function main() {
  const c = new Client({
    connectionString: POSTGRESQL_URI,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  await c.query("DELETE FROM users WHERE email LIKE '%@sigap.test'");

  const surveyorHash = await bcrypt.hash("surveyor123", 12);
  const rtRwHash = await bcrypt.hash("rt_rw123", 12);
  const operatorHash = await bcrypt.hash("operator123", 12);
  const petugasHash = await bcrypt.hash("petugas123", 12);
  const adminDaerahHash = await bcrypt.hash("admin_daerah123", 12);
  const auditorHash = await bcrypt.hash("auditor123", 12);
  const pengambilKeputusanHash = await bcrypt.hash("pengambil_keputusan123", 12);

  const users = [
    { email: "surveyor@sigap.test", role: "SURVEYOR", name: "Surveyor SIGAP", hash: surveyorHash },
    { email: "rt_rw@sigap.test", role: "RT_RW", name: "RT/RW SIGAP", hash: rtRwHash },
    { email: "operator@sigap.test", role: "OPERATOR", name: "Operator SIGAP", hash: operatorHash },
    { email: "petugas@sigap.test", role: "PETUGAS", name: "Petugas SIGAP", hash: petugasHash },
    { email: "admin_daerah@sigap.test", role: "ADMIN_DAERAH", name: "Admin Daerah SIGAP", hash: adminDaerahHash },
    { email: "auditor@sigap.test", role: "AUDITOR", name: "Auditor SIGAP", hash: auditorHash },
    { email: "pengambil_keputusan@sigap.test", role: "PENGAMBIL_KEPUTUSAN", name: "Pengambil Keputusan SIGAP", hash: pengambilKeputusanHash },
  ];
  for (const u of users) {
    await c.query(
      "INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
      [u.email, u.hash, u.name, u.role]
    );
  }
  console.log(`Seeded ${users.length} phase 2 users`);

  await c.query("DELETE FROM surveyor_tasks");
  const surveyorUser = (await c.query("SELECT id FROM users WHERE email = 'surveyor@sigap.test'")).rows[0];
  if (surveyorUser) {
    const reports = (await c.query("SELECT id FROM reports LIMIT 2")).rows;
    for (const r of reports) {
      await c.query(
        "INSERT INTO surveyor_tasks (report_id, surveyor_id, instructions, deadline, status) VALUES ($1, $2, $3, NOW() + interval '7 days', 'assigned')",
        [r.id, surveyorUser.id, `Verify kondisi lapangan untuk laporan ${r.id.slice(0, 8)}`]
      );
    }
    console.log(`Seeded surveyor_tasks for SURVEYOR user`);
  }

  const petugasUser = (await c.query("SELECT id FROM users WHERE email = 'petugas@sigap.test'")).rows[0];
  if (petugasUser) {
    const reports = (await c.query("SELECT id FROM reports LIMIT 2")).rows;
    for (const r of reports) {
      await c.query(
        "INSERT INTO surveyor_tasks (report_id, surveyor_id, instructions, deadline, status) VALUES ($1, $2, $3, NOW() + interval '7 days', 'assigned')",
        [r.id, petugasUser.id, `Tindak lanjuti laporan ${r.id.slice(0, 8)}`]
      );
    }
    console.log(`Seeded surveyor_tasks for PETUGAS user`);
  }

  await c.end();
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
