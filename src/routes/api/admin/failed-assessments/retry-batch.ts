import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";

export const retryBatchRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

retryBatchRoute.post(
  "/retry-batch",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const body = await c.req.json<{ ids: string[] }>();

    if (!body.ids || !Array.isArray(body.ids)) {
      return c.json({ error: { code: "INVALID_PARAMS", message: "ids must be an array" } }, 400);
    }

    if (body.ids.length > 100) {
      return c.json({ error: { code: "INVALID_PARAMS", message: "max 100 ids per batch" } }, 400);
    }

    const results = await withClient(c.env, async (client: PgClient) => {
      const output = [];
      for (const id of body.ids) {
        try {
          await client.query(
            `INSERT INTO assessment_retry_queue (report_id, created_at, status)
             VALUES ($1, NOW(), 'queued')
             ON CONFLICT (report_id) DO UPDATE SET
               status = 'queued',
               created_at = NOW(),
               retry_count = assessment_retry_queue.retry_count + 1`,
            [id]
          );
          output.push({ id, status: "queued" as const });
        } catch (err) {
          output.push({ id, status: "failed" as const, error: String(err) });
        }
      }
      return output;
    });

    return c.json({ results });
  })
);
