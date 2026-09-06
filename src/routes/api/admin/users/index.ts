import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { generateId } from "@/lib/id";
import { appendAudit } from "@/lib/audit";
import { createUser, updateUser } from "@/lib/schemas";

export const adminUsersRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
adminUsersRoute.get("/", async (c) => {
  const { results } = await c.env.D1.prepare(
    "SELECT id, email, name, role FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC",
  ).all();
  return c.json({ data: results });
});

adminUsersRoute.get("/:id", async (c) => {
  const { id } = c.req.param();
  const row = await c.env.D1.prepare(
    "SELECT id, email, name, role, created_at FROM users WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .first<{
      id: string;
      email: string;
      name: string;
      role: string;
      created_at: string;
    }>();
  if (!row) {
    return c.json({ error: "user_not_found" }, 404);
  }
  return c.json(row);
});

adminUsersRoute.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createUser.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      422,
    );
  const { email, password, name, role } = parsed.data;
  const id = generateId();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const result = await c.env.D1.prepare(
    "INSERT INTO users (id, email, password_hash, role, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, email, passwordHash, role, name, now, now)
    .run();
  if (!result.success) {
    const errStr = String(result.error ?? "");
    if (errStr.toLowerCase().includes("unique")) {
      return c.json({ error: "email_taken" }, 409);
    }
    return c.json({ error: "insert_failed" }, 500);
  }
  const user = c.get("user");
  c.executionCtx.waitUntil(
    appendAudit(c.env, {
      actor: user.sub,
      activeRole: user.role,
      action: "config_change",
      objectType: "user",
      objectId: id,
      reason: `user:create:${email}`,
    }),
  );
  return c.json({ id, email, name, role }, 201);
});

adminUsersRoute.put("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateUser.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      422,
    );
  const { role } = parsed.data;
  const existing = await c.env.D1.prepare(
    "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .first();
  if (!existing) {
    return c.json({ error: "user_not_found" }, 404);
  }
  const updates: string[] = [];
  const params: (string | null)[] = [];
  if (role !== undefined) {
    updates.push("role = ?");
    params.push(role);
  }
  params.push(new Date().toISOString());
  params.push(id);
  const updateResult = await c.env.D1.prepare(
    `UPDATE users SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`,
  )
    .bind(...params)
    .run();
  if (!updateResult.success) {
    return c.json({ error: "update_failed" }, 500);
  }
  const user = c.get("user");
  c.executionCtx.waitUntil(
    appendAudit(c.env, {
      actor: user.sub,
      activeRole: user.role,
      action: "config_change",
      objectType: "user",
      objectId: id,
      reason: `user:update:${id}`,
    }),
  );
  const updated = await c.env.D1.prepare(
    "SELECT id, email, name, role FROM users WHERE id = ?",
  )
    .bind(id)
    .first();
  return c.json(updated);
});
