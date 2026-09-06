import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { publicReportsRoute } from "@/routes/api/public/reports";

// Compatibility URL shares the canonical public visibility and data contract.
export const publicCasesRoute = new Hono<{ Bindings: Env }>();
publicCasesRoute.get("/", (c) => {
  const url = new URL(c.req.url);
  url.pathname = `/${encodeURIComponent(c.req.param("id") ?? "")}`;
  return publicReportsRoute.fetch(
    new Request(url, { headers: c.req.raw.headers }),
    c.env,
  );
});
