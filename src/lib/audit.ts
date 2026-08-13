import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";


export interface AuditEntry {
  actor: string;
  actorRole?: string;
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

async function hashEntry(prevHash: string, entry: { actor: string; action: string; objectType: string; objectId: string; before: string; after: string; reason: string }): Promise<string> {
  const data = prevHash + "|" + entry.actor + "|" + entry.action + "|" + entry.objectType + "|" + entry.objectId + "|" + entry.before + "|" + entry.after + "|" + entry.reason;
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function appendAudit(env: Env, entry: AuditEntry): Promise<void> {
  await withClient(env, async (c) => {
    await c.query("BEGIN");
    try {
      const prevResult = await c.query<{ entry_hash: string | null }>(
        "SELECT entry_hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE"
      );
      const prevHash = prevResult.rows[0]?.entry_hash ?? "0".repeat(64);
      const beforeStr = canonicalize(entry.before);
      const afterStr = canonicalize(entry.after);
      const reasonStr = entry.reason ?? "";
      const entry_hash = await hashEntry(prevHash, {
        actor: entry.actor,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId,
        before: beforeStr,
        after: afterStr,
        reason: reasonStr,
      });
      await c.query(
        `INSERT INTO audit_log (actor, actor_role, action, object_type, object_id, before_data, after_data, reason, prev_hash, entry_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, NOW())`,
        [entry.actor, entry.actorRole ?? null, entry.action, entry.objectType, entry.objectId, beforeStr, afterStr, reasonStr, prevHash, entry_hash]
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  });
}

export interface VerifyChainResult {
  ok: boolean;
  count: number;
  first_break_at?: number;
}

export async function verifyAuditChain(env: Env): Promise<VerifyChainResult> {
  return await withClient(env, async (c) => {
    const result = await c.query<{
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
    let prev = "0".repeat(64);
    let idx = 1;
    for (const row of result.rows) {
      if (row.prev_hash !== prev) {
        return { ok: false, count: result.rows.length, first_break_at: idx };
      }
      const beforeStr = canonicalize(row.before_data);
      const afterStr = canonicalize(row.after_data);
      const reasonStr = row.reason ?? "";
      const expected = await hashEntry(prev, {
        actor: row.actor,
        action: row.action,
        objectType: row.object_type,
        objectId: row.object_id,
        before: beforeStr,
        after: afterStr,
        reason: reasonStr,
      });
      if (expected !== row.entry_hash) {
        return { ok: false, count: result.rows.length, first_break_at: idx };
      }
      prev = row.entry_hash;
      idx++;
    }
    return { ok: true, count: result.rows.length };
  });
}
