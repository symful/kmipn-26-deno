import pg from "pg";
const { Client } = pg;

const c = new Client({
  connectionString: process.env.POSTGRESQL_URI,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log("=== USERS ===");
const users = await c.query("SELECT email, role FROM users ORDER BY role");
users.rows.forEach((r) => console.log(`  ${r.email} - ${r.role}`));

console.log("\n=== CATEGORIES ===");
const cats = await c.query("SELECT slug, name FROM categories ORDER BY slug");
cats.rows.forEach((r) => console.log(`  ${r.slug} - ${r.name}`));

await c.end();
