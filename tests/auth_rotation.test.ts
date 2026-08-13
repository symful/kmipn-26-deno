import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "pg";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  verifyRefreshToken,
  revokeRefreshToken,
  isRefreshTokenRevoked,
} from "../src/lib/auth.ts";

vi.mock("@/lib/db", () => ({
  withClient: vi.fn(),
}));

const mockWithClient = vi.mocked(
  // @ts-expect-error - module mock
  (await import("@/lib/db")).withClient,
);

function makeEnv(): { JWT_SECRET: string } {
  return { JWT_SECRET: "test-secret-key-for-testing-only-32chars!" };
}

describe("auth token rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("old refresh token is revoked after rotation", async () => {
    const env = makeEnv();
    const queryMock = vi.fn();
    const insertMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn({
        query: (sql: string, params: unknown[]) => {
          if (sql.includes("INSERT")) return insertMock(sql, params);
          return queryMock(sql, params);
        },
      } as unknown as InstanceType<typeof Client>);
    });

    const userPayload = {
      sub: "user-123",
      role: "VERIFIKATOR" as const,
      email: "test@example.com",
    };

    const oldJti = "old-jti-abc";
    const oldRefreshToken = await signRefreshToken(env, { ...userPayload, jti: oldJti });
    const oldPayload = await verifyToken(env, oldRefreshToken, "refresh");
    expect(oldPayload.jti).toBe(oldJti);

    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    await revokeRefreshToken(env, oldJti, new Date(oldPayload.exp! * 1000));
    expect(insertMock).toHaveBeenCalledWith(
      "INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING",
      [oldJti, expect.any(String)],
    );

    queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });
    const isRevoked = await isRefreshTokenRevoked(env, oldJti);
    expect(isRevoked).toBe(true);
  });

  it("new refresh token has different jti from old", async () => {
    const env = makeEnv();
    mockWithClient.mockImplementation(async () => {});

    const userPayload = {
      sub: "user-456",
      role: "ADMIN" as const,
      email: "admin@example.com",
    };

    const oldJti = "old-jti-xyz";
    const oldToken = await signRefreshToken(env, { ...userPayload, jti: oldJti });
    const oldPayload = await verifyToken(env, oldToken, "refresh");
    expect(oldPayload.jti).toBe(oldJti);

    const newJti = "new-jti-xyz";
    const newToken = await signRefreshToken(env, { ...userPayload, jti: newJti });
    const newPayload = await verifyToken(env, newToken, "refresh");
    expect(newPayload.jti).toBe(newJti);
    expect(newPayload.jti).not.toBe(oldJti);
  });

  it("revoked old refresh token fails verification", async () => {
    const env = makeEnv();
    const insertMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const selectMock = vi.fn()
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn({
        query: (sql: string, params: unknown[]) => {
          if (sql.includes("INSERT")) return insertMock(sql, params);
          return selectMock(sql, params);
        },
      } as unknown as InstanceType<typeof Client>);
    });

    const userPayload = {
      sub: "user-789",
      role: "VERIFIKATOR" as const,
      email: "test2@example.com",
    };

    const oldJti = "revoked-jti";
    const oldToken = await signRefreshToken(env, { ...userPayload, jti: oldJti });
    await revokeRefreshToken(env, oldJti, new Date("2030-01-01"));

    const isRevoked = await isRefreshTokenRevoked(env, oldJti);
    expect(isRevoked).toBe(true);
  });
});
