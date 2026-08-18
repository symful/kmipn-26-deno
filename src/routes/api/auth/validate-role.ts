import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const authValidateRoleRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

authValidateRoleRoute.get("/", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");
  const roles = user.roles ?? [user.role];
  return c.json({
    valid: true,
    roles,
    active_role: user.role,
  });
}));
