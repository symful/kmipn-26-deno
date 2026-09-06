import type { MiddlewareHandler } from "hono";

export const cspMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } finally {
    try {
      c.header(
        "Content-Security-Policy",
        "default-src 'self' https: data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
          "style-src 'self' 'unsafe-inline' https:; " +
          "font-src 'self' https: data:; " +
          "img-src 'self' data: blob: https:; " +
          "connect-src 'self' https: wss: http://localhost:* ws://localhost:*; " +
          "frame-ancestors 'none';",
      );
      c.header("X-Frame-Options", "DENY");
      c.header("X-Content-Type-Options", "nosniff");
    } catch (headerErr) {
      console.error("CSP middleware header error:", headerErr);
    }
  }
};
