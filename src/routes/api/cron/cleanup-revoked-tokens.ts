import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface CleanupResult {
  deleted_count: number;
}

export async function cleanupRevokedTokens(env: Env, actor?: string): Promise<CleanupResult> {
  let deletedCount = 0;

  await withClient(env, async (client) => {
    const r = await client.query<{ count: bigint }>(
      `DELETE FROM revoked_tokens WHERE expires_at < NOW() - INTERVAL '30 days'`
    );
    deletedCount = Number(r.rowCount ?? 0);
  });

  logger.info({
    route: "/cron/cleanup-revoked-tokens",
    method: actor ? "MANUAL" : "SCHEDULED",
    context: "revoked_tokens_cleanup",
    deleted_count: deletedCount,
  });

  return { deleted_count: deletedCount };
}

export const cleanupRevokedTokensRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

cleanupRevokedTokensRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const actor = c.get("user").sub;
    const result = await cleanupRevokedTokens(c.env, actor);
    return c.json(result);
  }),
);
