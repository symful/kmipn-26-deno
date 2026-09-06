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

/** Prepare one audit write for use inside the caller's existing D1 transaction. */
export function prepareAuditStatement(env: Env, entry: AuditEntry) {
  const randomHash = crypto.randomUUID().replaceAll("-", "");
  return env.D1.prepare(
    `INSERT INTO audit_log (actor, actor_role, action, object_type, object_id, before_data, after_data, reason, prev_hash, entry_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(
    entry.actor,
    entry.activeRole ?? entry.actorRole ?? null,
    entry.action,
    entry.objectType,
    entry.objectId,
    canonicalize(entry.before),
    canonicalize(entry.after),
    entry.reason ?? "",
    randomHash,
    randomHash,
  );
}

/** Resolves only once this environment's audit entry is durable; failures propagate. */
export async function appendAudit(env: Env, entry: AuditEntry): Promise<void> {
  await prepareAuditStatement(env, entry).run();
}
function canonicalize(obj: unknown): string {
  if (obj === undefined) return JSON.stringify(null);
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalize((obj as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
