import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";

const GENESIS_HASH = "0".repeat(64);

export interface AuditEntry {
  actor: string;
  actorRole?: string;
  activeRole?: string;
  action: string;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

function canonicalize(obj: unknown): string {
  if (obj === undefined) return JSON.stringify(null);
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k])).join(",") + "}";
}

async function computeEntryHash(
  prevHash: string,
  actor: string,
  action: string,
  objectType: string,
  objectId: string,
  beforeStr: string,
  afterStr: string,
  reasonStr: string,
): Promise<string> {
  const data = prevHash + "|" + actor + "|" + action + "|" + objectType + "|" + objectId + "|" + beforeStr + "|" + afterStr + "|" + reasonStr;
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function appendAudit(env: Env, entry: AuditEntry): Promise<void> {
  await withClient(env, async (c) => {
    await c.query("BEGIN");
    try {
      const prevResult = await c.query<{ entry_hash: string | null }>(
        "SELECT entry_hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE",
      );
      const prevHash = prevResult.rows[0]?.entry_hash ?? GENESIS_HASH;

      const beforeStr = canonicalize(entry.before);
      const afterStr = canonicalize(entry.after);
      const reasonStr = entry.reason ?? "";

      const entryHash = await computeEntryHash(
        prevHash,
        entry.actor,
        entry.action,
        entry.objectType,
        entry.objectId,
        beforeStr,
        afterStr,
        reasonStr,
      );

      await c.query(
        `INSERT INTO audit_log (actor, actor_role, action, object_type, object_id, before_data, after_data, reason, prev_hash, entry_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, NOW())`,
        [
          entry.actor,
          entry.activeRole ?? entry.actorRole ?? null,
          entry.action,
          entry.objectType,
          entry.objectId,
          beforeStr,
          afterStr,
          reasonStr,
          prevHash,
          entryHash,
        ],
      );

      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
}
