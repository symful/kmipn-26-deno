import type { MiddlewareHandler } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";

export type Role = "ADMIN" | "VERIFIKATOR" | "SURVEYOR" | "OPERATOR" | "RT_RW" | "PETUGAS" | "ADMIN_DAERAH" | "AUDITOR" | "PENGAMBIL_KEPUTUSAN";

export const requireRole = (...allowedRoles: Role[]): MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> => {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (!allowedRoles.includes(user.role as Role)) {
      return c.json({ error: "forbidden", required_roles: allowedRoles }, 403);
    }
    return await next();
  };
};
