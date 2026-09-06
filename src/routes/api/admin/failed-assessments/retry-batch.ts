import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson } from "@/lib/validation";
import { AdminRetryBatchSchema } from "@/lib/schemas";
import { retrySingleAssessment } from "@/lib/agent/retry";

export const retryBatchRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

retryBatchRoute.post(
  "/",
  safeHandler(async (c) => {
    const { ids } = await parseJson(c, AdminRetryBatchSchema);
    const user = c.get("user");

    const results = [];
    for (const id of ids) {
      const result = await retrySingleAssessment(
        c.env,
        id,
        user.sub,
        user.role,
      );
      results.push(result);
    }

    return c.json({ results });
  }),
);
