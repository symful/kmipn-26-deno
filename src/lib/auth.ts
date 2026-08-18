import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { MiddlewareHandler } from "hono";
import type { Env } from "@/types/bindings";
import { withClient } from "@/lib/db";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

function getSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export interface JwtPayload {
  sub: string;
  role: "ADMIN" | "VERIFIKATOR" | "SURVEYOR" | "OPERATOR" | "RT_RW" | "PETUGAS" | "ADMIN_DAERAH" | "AUDITOR" | "PENGAMBIL_KEPUTUSAN" | "WARGA";
  roles?: string[];
  wilayah_id?: string | null;
  email?: string;
  type: "access" | "refresh";
  jti?: string;
  exp?: number;
}

export interface AuthVariables {
  user: JwtPayload;
}

export async function signAccessToken(env: Env, payload: Omit<JwtPayload, "type">): Promise<string> {
  return await new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getSecret(env));
}

export async function signRefreshToken(env: Env, payload: Omit<JwtPayload, "type"> & { jti: string }): Promise<string> {
  return await new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .setJti(payload.jti)
    .sign(getSecret(env));
}

const RT_RW_TOKEN_TTL = "7d";

export async function signRtRwToken(env: Env, payload: Omit<JwtPayload, "type">): Promise<string> {
  return await new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(RT_RW_TOKEN_TTL)
    .sign(getSecret(env));
}

export async function verifyToken(env: Env, token: string, expectedType: "access" | "refresh"): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(env));
  if (payload.type !== expectedType) {
    throw new Error(`Token type mismatch: expected ${expectedType}, got ${payload.type}`);
  }
  return payload as unknown as JwtPayload;
}

export async function verifyRefreshToken(env: Env, token: string): Promise<JwtPayload> {
  return await verifyToken(env, token, "refresh");
}

export async function revokeRefreshToken(env: Env, jti: string, expiresAt: Date): Promise<void> {
  await withClient(env, async (client) => {
    await client.query(
      "INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING",
      [jti, expiresAt.toISOString()]
    );
  });
}

export async function isRefreshTokenRevoked(env: Env, jti: string): Promise<boolean> {
  return await withClient(env, async (client) => {
    const result = await client.query(
      "SELECT 1 FROM revoked_tokens WHERE jti = $1",
      [jti]
    );
    return result.rowCount !== null && result.rowCount > 0;
  });
}

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 4);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const token = auth.slice("Bearer ".length).trim();
  try {
    const payload = await verifyToken(c.env, token, "access");

    const activeRole = c.req.header("X-Active-Role");
    if (activeRole) {
      const userRoles = payload.roles ?? [payload.role];
      if (userRoles.includes(activeRole)) {
        payload.role = activeRole as JwtPayload["role"];
      } else {
        return c.json({
          error: "active_role_not_granted",
          message: `Role '${activeRole}' not in user's granted roles`,
          current_role: payload.role,
          requested_role: activeRole
        }, 403);
      }
    }

    c.set("user", payload);
    return await next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
};
