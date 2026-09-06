import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const authMeRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

interface MeUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  disabled: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

authMeRoute.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");

    const row = await c.env.D1.prepare(
      "SELECT id, email, name, role, disabled, created_at, updated_at, deleted_at FROM users WHERE id = ?",
    )
      .bind(user.sub)
      .first<MeUserRow>();

    if (!row) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }

    return c.json({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      disabled: Boolean(row.disabled),
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    });
  }),
);
