import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const dbPath = join(root, `.check-schema-${randomUUID()}.db`);

try {
  const schema = readFileSync(join(root, "scripts", "schema.sql"), "utf8");
  const seed = readFileSync(join(root, "scripts", "seed.sql"), "utf8");

  const sql = schema + "\n" + seed;

  execFileSync("sqlite3", [dbPath], {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15_000,
  });

  const check = execFileSync(
    "sqlite3",
    [dbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 },
  );

  const tables = check.toString().trim().split("\n").filter(Boolean);
  console.log(`db:check OK — ${tables.length} tables created:`);
  console.log(tables.join(", "));
} catch (e) {
  console.error("db:check FAILED");
  console.error(e.stderr?.toString() ?? e.message);
  process.exit(1);
} finally {
  if (existsSync(dbPath)) unlinkSync(dbPath);
}
