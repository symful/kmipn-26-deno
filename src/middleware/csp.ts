import type { MiddlewareHandler } from "hono";

export const cspMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } finally {
    try {
      c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' https://cdn.sigap.go.id; connect-src 'self'; frame-ancestors 'none'");
      c.header("X-Frame-Options", "DENY");
      c.header("X-Content-Type-Options", "nosniff");
    } catch (headerErr) {
      console.error("CSP middleware header error:", headerErr);
    }
  }
};
