import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "pg";
import {
  signAccessToken,
  signRefreshToken,
  signRtRwToken,
  verifyToken,
  revokeRefreshToken,
  isRefreshTokenRevoked,
  hashPassword,
  verifyPassword,
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

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signAccessToken", () => {
    it("signs a valid access token", async () => {
      const env = makeEnv();
      const token = await signAccessToken(env, {
        sub: "user-123",
        role: "VERIFIKATOR",
        email: "test@example.com",
      });
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("includes sub, role, email in payload", async () => {
      const env = makeEnv();
      const token = await signAccessToken(env, {
        sub: "user-456",
        role: "ADMIN",
        email: "admin@example.com",
      });
      const payload = await verifyToken(env, token, "access");
      expect(payload.sub).toBe("user-456");
      expect(payload.role).toBe("ADMIN");
      expect(payload.email).toBe("admin@example.com");
      expect(payload.type).toBe("access");
    });
  });

  describe("signRefreshToken", () => {
    it("signs a refresh token with jti", async () => {
      const env = makeEnv();
      const token = await signRefreshToken(env, {
        sub: "user-789",
        role: "SURVEYOR",
        jti: "jti-abc-123",
      });
      const payload = await verifyToken(env, token, "refresh");
      expect(payload.sub).toBe("user-789");
      expect(payload.jti).toBe("jti-abc-123");
      expect(payload.type).toBe("refresh");
    });
  });

  describe("signRtRwToken", () => {
    it("signs an RT_RW token", async () => {
      const env = makeEnv();
      const token = await signRtRwToken(env, {
        sub: "rt-rw-001",
        role: "RT_RW",
      });
      const payload = await verifyToken(env, token, "access");
      expect(payload.sub).toBe("rt-rw-001");
      expect(payload.role).toBe("RT_RW");
      expect(payload.type).toBe("access");
    });
  });

  describe("verifyToken", () => {
    it("verifies a valid access token", async () => {
      const env = makeEnv();
      const token = await signAccessToken(env, {
        sub: "user-123",
        role: "VERIFIKATOR",
      });
      const payload = await verifyToken(env, token, "access");
      expect(payload.sub).toBe("user-123");
    });

    it("throws on token type mismatch", async () => {
      const env = makeEnv();
      const refreshToken = await signRefreshToken(env, {
        sub: "user-123",
        role: "VERIFIKATOR",
        jti: "jti-123",
      });
      await expect(verifyToken(env, refreshToken, "access")).rejects.toThrow(
        /Token type mismatch/,
      );
    });

    it("throws on invalid signature", async () => {
      const env = makeEnv();
      const token = await signAccessToken({ JWT_SECRET: "different-secret-key-for-testing!!" }, {
        sub: "user-123",
        role: "VERIFIKATOR",
      });
      await expect(verifyToken(env, token, "access")).rejects.toThrow();
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("hashes and verifies a correct password", async () => {
      const hash = await hashPassword("securePassword123!");
      expect(hash).not.toBe("securePassword123!");
      const valid = await verifyPassword("securePassword123!", hash);
      expect(valid).toBe(true);
    });

    it("rejects an incorrect password", async () => {
      const hash = await hashPassword("myPassword");
      const invalid = await verifyPassword("wrongPassword", hash);
      expect(invalid).toBe(false);
    });

    it("produces different hashes for same password (bcrypt salt)", async () => {
      const hash1 = await hashPassword("samePassword");
      const hash2 = await hashPassword("samePassword");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("revokeRefreshToken", () => {
    it("inserts jti into revoked_tokens DB table", async () => {
      const env = makeEnv();
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      } as unknown as InstanceType<typeof Client>;
      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      await revokeRefreshToken(env, "jti-to-revoke", new Date("2030-01-01"));

      expect(mockWithClient).toHaveBeenCalledWith(env, expect.any(Function));
      expect(mockClient.query).toHaveBeenCalledWith(
        "INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING",
        ["jti-to-revoke", "2030-01-01T00:00:00.000Z"],
      );
    });
  });

  describe("isRefreshTokenRevoked", () => {
    it("queries DB and returns true when jti is revoked", async () => {
      const env = makeEnv();
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 }),
      } as unknown as InstanceType<typeof Client>;
      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const isRevoked = await isRefreshTokenRevoked(env, "jti-db-revoke");
      expect(isRevoked).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT 1 FROM revoked_tokens WHERE jti = $1",
        ["jti-db-revoke"],
      );
    });

    it("returns false when jti not found in DB", async () => {
      const env = makeEnv();
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      } as unknown as InstanceType<typeof Client>;
      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const isRevoked = await isRefreshTokenRevoked(env, "jti-unknown");
      expect(isRevoked).toBe(false);
    });
  });
});
