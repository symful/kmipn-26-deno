import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const auditVerifyChainRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

auditVerifyChainRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;

    const result = await env.D1.prepare(
      `SELECT id, prev_hash, entry_hash, created_at
       FROM audit_log
       ORDER BY created_at ASC, id ASC`,
    ).all<{
      id: number;
      prev_hash: string | null;
      entry_hash: string | null;
      created_at: string;
    }>();

    const entries = result.results ?? [];
    const count = entries.length;

    let prevEntryHash: string | null = null;
    let prevId = 0;

    for (let i = 0; i < entries.length; i++) {
      const row = entries[i]!;

      if (row.entry_hash === null) {
        return c.json({
          ok: false,
          count,
          first_break_at: new Date(row.created_at).toISOString(),
        });
      }

      if (
        row.prev_hash !== null &&
        prevEntryHash !== null &&
        row.prev_hash !== prevEntryHash
      ) {
        return c.json({
          ok: false,
          count,
          first_break_at: new Date(row.created_at).toISOString(),
        });
      }

      if (i > 0 && row.id !== prevId + 1) {
        return c.json({
          ok: false,
          count,
          first_break_at: new Date(row.created_at).toISOString(),
        });
      }

      prevEntryHash = row.entry_hash;
      prevId = row.id;
    }

    return c.json({ ok: true, count });
  }),
);
