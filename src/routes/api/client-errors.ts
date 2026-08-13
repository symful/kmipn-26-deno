import { Hono } from "hono";
import { logger } from "@/lib/logger";

export const clientErrorsRoute = new Hono();

clientErrorsRoute.post("/", async (c) => {
  try {
    const body = await c.req.json<{
      level: "error";
      message: string;
      timestamp: string;
      context?: Record<string, unknown>;
    }>();

    // Log to server-side logger
    logger.error({
      route: "/api/client-errors",
      method: "POST",
      error: new Error(`[Client] ${body.message}`),
      clientTimestamp: body.timestamp,
      ...body.context,
    });

    return c.json({ ok: true });
  } catch (e) {
    // Best-effort: don't let client errors crash server
    logger.error({ route: "/api/client-errors", method: "POST", error: e as Error, context: "client_error_endpoint_failed" });
    return c.json({ ok: true });
  }
});
