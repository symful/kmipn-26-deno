import { withClient } from "@/lib/db";
import type { Env } from "@/types/bindings";


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

export async function appendAudit(env: Env, entry: AuditEntry): Promise<void> {
  await withClient(env, async (c) => {
    const beforeStr = canonicalize(entry.before);
    const afterStr = canonicalize(entry.after);
    const reasonStr = entry.reason ?? "";
    await c.query(
      `INSERT INTO audit_log (actor, actor_role, action, object_type, object_id, before_data, after_data, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW())`,
      [entry.actor, entry.activeRole ?? entry.actorRole ?? null, entry.action, entry.objectType, entry.objectId, beforeStr, afterStr, reasonStr]
    );
  });
}
