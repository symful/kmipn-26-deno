import pg from "pg";
import { randomUUID } from "crypto";

const { Client } = pg;

const POSTGRESQL_URI = process.env.POSTGRESQL_URI!;
if (!POSTGRESQL_URI) {
  console.error("POSTGRESQL_URI not set");
  process.exit(1);
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const clientConfig: pg.ClientConfig = {
    connectionString: POSTGRESQL_URI,
  };
  const isSsl = POSTGRESQL_URI.startsWith("postgres://") || POSTGRESQL_URI.startsWith("postgresql://");
  if (isSsl) {
    (clientConfig as any).ssl = { rejectUnauthorized: false };
  }
  const client = new Client(clientConfig);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function hashEntry(prevHash: string, entry: { actor: string; action: string; objectType: string; objectId: string; before: string; after: string; reason: string }): Promise<string> {
  const data = prevHash + "|" + entry.actor + "|" + entry.action + "|" + entry.objectType + "|" + entry.objectId + "|" + entry.before + "|" + entry.after + "|" + entry.reason;
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function insertAuditEntry(client: pg.Client, actor: string, action: string, objectId: string): Promise<string> {
  const prevResult = await client.query<{ entry_hash: string | null }>(
    "SELECT entry_hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE"
  );
  const prevHash = prevResult.rows[0]?.entry_hash ?? "0".repeat(64);
  const entry_hash = await hashEntry(prevHash, {
    actor,
    action,
    objectType: "report",
    objectId,
    before: "{}",
    after: "{}",
    reason: "chain test",
  });
  await client.query(
    `INSERT INTO audit_log (actor, actor_role, action, object_type, object_id, before_data, after_data, reason, prev_hash, entry_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, '{}', '{}', $6, $7, $8, NOW())`,
    [actor, "ADMIN", action, "report", objectId, "chain test", prevHash, entry_hash]
  );
  return entry_hash;
}

async function verifyChain(client: pg.Client): Promise<{ ok: boolean; count: number; first_break_at?: number }> {
  const result = await client.query<{
    prev_hash: string;
    entry_hash: string;
    actor: string;
    action: string;
    object_type: string;
    object_id: string;
    before_data: unknown;
    after_data: unknown;
    reason: string | null;
  }>(
    "SELECT prev_hash, entry_hash, actor, action, object_type, object_id, before_data, after_data, reason FROM audit_log ORDER BY created_at ASC, id ASC"
  );

  function canonicalize(obj: unknown): string {
    if (obj === undefined) return JSON.stringify(null);
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k])).join(",") + "}";
  }

  async function hashEntryLocal(prev: string, row: typeof result.rows[0]): Promise<string> {
    const data = prev + "|" + row.actor + "|" + row.action + "|" + row.object_type + "|" + row.object_id + "|" + canonicalize(row.before_data) + "|" + canonicalize(row.after_data) + "|" + (row.reason ?? "");
    const encoded = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  let prev = "0".repeat(64);
  let idx = 1;
  for (const row of result.rows) {
    if (row.prev_hash !== prev) {
      return { ok: false, count: result.rows.length, first_break_at: idx };
    }
    const expected = await hashEntryLocal(prev, row);
    if (expected !== row.entry_hash) {
      return { ok: false, count: result.rows.length, first_break_at: idx };
    }
    prev = row.entry_hash;
    idx++;
  }
  return { ok: true, count: result.rows.length };
}

async function main() {
  console.log("=== Audit Chain Test ===\n");

  await withClient(async (client) => {
    const testActorId = "00000000-0000-0000-0000-000000000001";

    console.log("Cleaning up any existing test audit entries...");
    await client.query("DELETE FROM audit_log WHERE reason = 'chain test'");

    console.log("\n1. Inserting 10 audit entries...");
    const entryIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const objectId = randomUUID();
      await insertAuditEntry(client, testActorId, `test_action_${i}`, objectId);
      const result = await client.query<{ id: string }>("SELECT id FROM audit_log WHERE object_id = $1 ORDER BY created_at DESC LIMIT 1", [objectId]);
      entryIds.push(result.rows[0]!.id);
      console.log(`   Inserted entry ${i + 1}: ${objectId.slice(0, 8)}...`);
    }

    console.log("\n2. Verifying chain (expect ok=true, count=10)...");
    const verify1 = await verifyChain(client);
    console.log(`   Result: ${JSON.stringify(verify1)}`);
    if (!verify1.ok || verify1.count !== 10) {
      console.error("   FAIL: Expected {ok: true, count: 10}");
      process.exit(1);
    }
    console.log("   PASS\n");

    console.log("3. Tampering with entry at index 5...");
    const tamperedId = entryIds[5];
    await client.query(
      "UPDATE audit_log SET reason = 'TAMPERED' WHERE id = $1",
      [tamperedId]
    );
    console.log(`   Tampered entry ID: ${tamperedId}\n`);

    console.log("4. Verifying chain (expect ok=false, first_break_at=6)...");
    const verify2 = await verifyChain(client);
    console.log(`   Result: ${JSON.stringify(verify2)}`);
    if (verify2.ok || verify2.first_break_at !== 6) {
      console.error(`   FAIL: Expected {ok: false, first_break_at: 6}, got ${JSON.stringify(verify2)}`);
      process.exit(1);
    }
    console.log("   PASS\n");

    console.log("5. Cleaning up test entries...");
    await client.query("DELETE FROM audit_log WHERE reason = 'chain test' OR reason = 'TAMPERED'");
    console.log("   Cleaned up\n");

    console.log("=== All audit chain tests PASSED ===");
  });

  process.exit(0);
}

main().catch((e) => {
  console.error("Audit chain test failed:", e);
  process.exit(1);
});
