import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const authMeRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

authMeRoute.get("/", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");
  return c.json({
    id: user.sub,
    email: user.email,
    role: user.role,
  });
}));
