import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { verifyToken, type JwtPayload } from "@/lib/auth";

export const authValidateRoleRoute = new Hono<{ Bindings: Env }>();

authValidateRoleRoute.post(
  "/",
  safeHandler(async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } }, 401);
    }
    const token = auth.slice("Bearer ".length).trim();

    let payload: JwtPayload;
    try {
      payload = await verifyToken(c.env, token, "access");
    } catch {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } }, 401);
    }

    const body = await c.req.json();
    const { role } = body as { role?: string };

    if (!role || typeof role !== "string") {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Role is required" } }, 400);
    }

    const validRoles = ["ADMIN", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "RT_RW", "PETUGAS", "ADMIN_DAERAH", "AUDITOR", "PENGAMBIL_KEPUTUSAN"] as const;

    if (!validRoles.includes(role as typeof validRoles[number])) {
      return c.json({ error: { code: "INVALID_ROLE", message: "Invalid role specified" } }, 400);
    }

    const { withClient } = await import("@/lib/db");
    const userRoles = await withClient(c.env, async (client) => {
      const result = await client.query(
        `SELECT r.name as role FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1 AND ur.deleted_at IS NULL`,
        [payload.sub]
      );
      return result.rows.map((row: { role: string }) => row.role);
    });

    const allowedRoles = userRoles.length > 0 ? userRoles : [payload.role];

    const isAllowed = allowedRoles.some(
      (r: string) => r.toUpperCase() === role.toUpperCase()
    );

    if (!isAllowed) {
      return c.json({
        valid: false,
        error: { code: "ROLE_NOT_ASSIGNED", message: "User does not have this role assigned" }
      }, 403);
    }

    return c.json({
      valid: true,
      role: role.toUpperCase(),
      allowedRoles: allowedRoles,
    });
  }),
);
