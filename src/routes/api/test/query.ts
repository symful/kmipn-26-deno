import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { z } from "zod";

const QuerySchema = z.object({
  sql: z.string().min(1).max(5000),
});

export const testQueryRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

testQueryRoute.post(
  "/",
  safeHandler(async (c) => {
    if (c.env.ENABLE_TEST_RESET !== "true") {
      return c.json({ error: { code: "FORBIDDEN", message: "Test endpoints not enabled" } }, 403);
    }

    const testSecret = c.req.header("X-Test-Secret");
    if (!testSecret || testSecret !== c.env.TEST_RESET_SECRET) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid test secret" } }, 401);
    }

    const body = await c.req.json();
    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "sql is required (string, max 5000 chars)" } }, 400);
    }

    try {
      const result = await withClient(c.env, async (client) => {
        const res = await client.query(parsed.data.sql);
        return res;
      });
      return c.json({
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields?.map((f) => ({ name: f.name, dataTypeId: f.dataTypeID })) ?? [],
      });
    } catch (err) {
      return c.json({
        error: {
          code: "QUERY_ERROR",
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
      }, 500);
    }
  }),
);
