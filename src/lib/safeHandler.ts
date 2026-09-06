import type { Context } from "hono";
import { logger } from "./logger";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { BodyError } from "./validation";

type RouteHandler = (
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
) => Promise<Response>;

/**
 * Serialize an Error into a structured shape that is safe to send to the client.
 * Includes name, message, and stack — the stack lets the operator see the failure
 * path without having to reach for `wrangler tail`. Sensitive fields (tokens,
 * passwords, request bodies) must NEVER be embedded in thrown errors by callers;
 * safeHandler just passes through whatever is on the Error.
 */
function serializeError(err: Error): {
  name: string;
  message: string;
  stack: string;
} {
  return {
    name: err.name || "Error",
    message: err.message || String(err),
    stack: err.stack || "",
  };
}

/**
 * Wraps a Hono route handler in try/catch.
 *
 * On success → returns the original response unchanged.
 *
 * On error:
 *   1. Logs the full error (name + message + stack + route + method + user_id)
 *      to stdout via the structured JSON logger (server-side observability).
 *   2. Returns HTTP 500 with a generic message to the client.
 *      In development, includes error details for debugging.
 *      In production, strips all internal details to prevent leakage.
 *
 * The response shape is:
 *   {
 *     error: {
 *       code: "INTERNAL_ERROR",
 *       message: "Internal server error"  // or detailed in dev
 *     }
 *   }
 *
 * Callers must not embed secrets (tokens, passwords, full request bodies) in
 * thrown errors; safeHandler passes through whatever is on the Error object.
 */
export function safeHandler<T extends RouteHandler>(fn: T): RouteHandler {
  return async (
    c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  ): Promise<Response> => {
    try {
      return await fn(c);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const serialized = serializeError(error);

      // 1. Log full error to stdout (server-side observability)
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error,
        user_id: c.get("user")?.sub,
      });

      const isDev = c.env.ENVIRONMENT === "development";

      // BodyError → 400 with field-level detail
      if (error instanceof BodyError) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: error.zodErr.issues
                .map(
                  (issue) =>
                    `${issue.path.join(".") || "body"}: ${issue.message}`,
                )
                .join("; "),
            },
            details: {
              ...error.zodErr.flatten(),
            },
          },
          400,
        );
      }

      if (
        /HTTP 429|rate_limit_error|Token Plan rate limit/i.test(
          serialized.message,
        )
      ) {
        return c.json(
          {
            error: {
              code: "LLM_RATE_LIMITED",
              message: "LLM provider rate limit reached",
            },
          },
          429,
        );
      }

      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: isDev ? serialized.message : "Internal server error",
          },
        },
        500,
      );
    }
  };
}

export default safeHandler;
