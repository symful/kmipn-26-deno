import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { MiddlewareHandler } from "hono";
import type { Env } from "@/types/bindings";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

function getSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export interface JwtPayload {
  sub: string;
  role: "ADMIN" | "PETUGAS" | "WARGA";
  roles?: string[];
  email?: string;
  type: "access" | "refresh";
  jti?: string;
  exp?: number;
}

export interface AuthVariables {
  user: JwtPayload;
}

export async function signAccessToken(
  env: Env,
  payload: Omit<JwtPayload, "type">,
): Promise<string> {
  return await new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getSecret(env));
}

export async function signRefreshToken(
  env: Env,
  payload: Omit<JwtPayload, "type"> & { jti: string },
): Promise<string> {
  return await new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .setJti(payload.jti)
    .sign(getSecret(env));
}

export async function verifyToken(
  env: Env,
  token: string,
  expectedType: "access" | "refresh",
): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(env));
  if (payload.type !== expectedType) {
    throw new Error(
      `Token type mismatch: expected ${expectedType}, got ${payload.type}`,
    );
  }
  return payload as unknown as JwtPayload;
}

export async function revokeRefreshToken(
  env: Env,
  jti: string,
  expiresAt: Date,
): Promise<void> {
  await env.D1.prepare(
    "INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)",
  )
    .bind(jti, expiresAt.toISOString())
    .run();
}

export async function isRefreshTokenRevoked(
  env: Env,
  jti: string,
): Promise<boolean> {
  const result = await env.D1.prepare(
    "SELECT 1 FROM revoked_tokens WHERE jti = ?",
  )
    .bind(jti)
    .first();
  return result !== null;
}

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 4);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const token = auth.slice("Bearer ".length).trim();
  try {
    const payload = await verifyToken(c.env, token, "access");

    c.set("user", payload);
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
  return await next();
};

export const optionalAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    c.set("user", null as unknown as JwtPayload);
    return await next();
  }
  const token = auth.slice("Bearer ".length).trim();
  try {
    const payload = await verifyToken(c.env, token, "access");
    c.set("user", payload);
  } catch {
    c.set("user", null as unknown as JwtPayload);
  }
  return await next();
};
