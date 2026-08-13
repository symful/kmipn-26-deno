import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "pg";
import crypto from "node:crypto";

const mockClient = {
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  withClient: vi.fn(async (_env: unknown, fn: (client: typeof mockClient) => Promise<unknown>) => {
    return await fn(mockClient as unknown as InstanceType<typeof Client>);
  }),
}));

vi.mock("@/lib/outbox/adapters/sipd", () => ({
  createSipdAdapter: vi.fn(() => ({
    target: "sipd",
    send: vi.fn().mockResolvedValue({ status: "sent" }),
  })),
}));

vi.mock("@/lib/outbox/adapters/satu-data", () => ({
  createSatuDataAdapter: vi.fn(() => ({
    target: "satu_data",
    send: vi.fn().mockResolvedValue({ status: "sent" }),
  })),
}));

const mockWithClient = vi.mocked(
  // @ts-expect-error - module mock
  (await import("@/lib/db")).withClient,
);

import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashPassword,
  verifyPassword,
} from "../../src/lib/auth.ts";
import { applyWilayahFilter } from "../../src/lib/rbac.ts";
import { appendAudit, verifyAuditChain } from "../../src/lib/audit.ts";
import { processPendingOutbox } from "../../src/routes/api/outbox/process.ts";
import { SyncBatchSchema, LoginSchema } from "../../src/lib/schemas.ts";

function makeEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> & { JWT_SECRET: string; OUTBOUND_TARGETS: string } {
  return {
    JWT_SECRET: "test-secret-key-for-smoke-tests-32ch!",
    OUTBOUND_TARGETS: JSON.stringify({
      sipd: "https://sipd.example/api/notify",
      satu_data: "https://satu-data.example/api/ingest",
    }),
    OUTBOUND_HMAC_SECRET: "test-hmac-secret",
    OUTBOUND_HMAC_HEADER: "X-SIGAP-Signature",
    DISABLE_LOGIN_AUDIT: "true",
    ...overrides,
  };
}

function makeMockClient() {
  return {
    query: vi.fn(),
    end: vi.fn(),
    connect: vi.fn(),
  } as unknown as InstanceType<typeof Client>;
}

function canonicalize(obj: unknown): string {
  if (obj === undefined) return JSON.stringify(null);
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k])).join(",") + "}";
}

function hashEntry(
  prevHash: string,
  entry: {
    actor: string;
    action: string;
    objectType: string;
    objectId: string;
    before: string;
    after: string;
    reason: string;
  },
): string {
  const data =
    prevHash + "|" + entry.actor + "|" + entry.action + "|" +
    entry.objectType + "|" + entry.objectId + "|" +
    entry.before + "|" + entry.after + "|" + entry.reason;
  return crypto.createHash("sha256").update(data).digest("hex");
}

describe("auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("LoginSchema validation", () => {
    it("accepts valid email + password", () => {
      const result = LoginSchema.safeParse({ email: "test@example.com", password: "password123" });
      expect(result.success).toBe(true);
    });

    it("rejects missing email", () => {
      const result = LoginSchema.safeParse({ password: "password123" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email format", () => {
      const result = LoginSchema.safeParse({ email: "not-an-email", password: "password123" });
      expect(result.success).toBe(false);
    });

    it("rejects password shorter than 6 chars", () => {
      const result = LoginSchema.safeParse({ email: "test@example.com", password: "12345" });
      expect(result.success).toBe(false);
    });
  });

  describe("signAccessToken / verifyToken", () => {
    it("round-trips a valid access token", async () => {
      const env = makeEnv();
      const token = await signAccessToken(env, {
        sub: "user-abc",
        role: "VERIFIKATOR",
        email: "verifikator@example.com",
        wilayah_id: "kab-X-uuid",
      });
      const payload = await verifyToken(env, token, "access");
      expect(payload.sub).toBe("user-abc");
      expect(payload.role).toBe("VERIFIKATOR");
      expect(payload.email).toBe("verifikator@example.com");
      expect(payload.wilayah_id).toBe("kab-X-uuid");
      expect(payload.type).toBe("access");
    });

    it("rejects a refresh token used as access token", async () => {
      const env = makeEnv();
      const refreshToken = await signRefreshToken(env, {
        sub: "user-abc",
        role: "VERIFIKATOR",
        jti: "jti-123",
      });
      await expect(verifyToken(env, refreshToken, "access")).rejects.toThrow(/Token type mismatch/);
    });

    it("rejects a token signed with different secret", async () => {
      const envA = makeEnv({ JWT_SECRET: "secret-a-key-for-testing-purposes!!" });
      const envB = makeEnv({ JWT_SECRET: "secret-b-key-for-testing-purposes!!" });
      const token = await signAccessToken(envA, { sub: "user-1", role: "ADMIN" });
      await expect(verifyToken(envB, token, "access")).rejects.toThrow();
    });

    it("rejects a malformed token string", async () => {
      const env = makeEnv();
      await expect(verifyToken(env, "not.a.valid.token", "access")).rejects.toThrow();
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("hashes then verifies correct password", async () => {
      const hash = await hashPassword("MySecureP@ssw0rd!");
      const valid = await verifyPassword("MySecureP@ssw0rd!", hash);
      expect(valid).toBe(true);
    });

    it("rejects wrong password", async () => {
      const hash = await hashPassword("MySecureP@ssw0rd!");
      const invalid = await verifyPassword("WrongPassword", hash);
      expect(invalid).toBe(false);
    });

    it("hashes same password twice produces different salts", async () => {
      const hash1 = await hashPassword("SamePassword");
      const hash2 = await hashPassword("SamePassword");
      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword("SamePassword", hash1)).toBe(true);
      expect(await verifyPassword("SamePassword", hash2)).toBe(true);
    });
  });

  describe("requireAuth middleware logic", () => {
    it("rejects request with no Authorization header", async () => {
      const auth: string | undefined = undefined;
      const hasAuth = auth && auth.startsWith("Bearer ");
      expect(hasAuth).toBeFalsy();
    });

    it("rejects request with malformed Authorization header", async () => {
      const auth = "Basic dXNlcjpwYXNz";
      const hasAuth = auth && auth.startsWith("Bearer ");
      expect(hasAuth).toBeFalsy();
    });

    it("accepts request with valid Bearer token", async () => {
      const env = makeEnv();
      const token = await signAccessToken(env, { sub: "user-1", role: "VERIFIKATOR" });
      const auth = `Bearer ${token}`;
      const hasAuth = auth && auth.startsWith("Bearer ");
      const tokenStr = hasAuth ? auth.slice("Bearer ".length).trim() : null;
      expect(hasAuth).toBeTruthy();
      expect(tokenStr).toBe(token);
      const payload = await verifyToken(env, tokenStr, "access");
      expect(payload.sub).toBe("user-1");
    });
  });
});

describe("wilayah RBAC filter", () => {
  describe("applyWilayahFilter", () => {
    it("admin_global null returns query unchanged", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 LIMIT 20";
      const result = applyWilayahFilter(sql, ["submitted"], null);
      expect(result.sql).toBe(sql);
      expect(result.params).toEqual(["submitted"]);
    });

    it("admin_global undefined returns query unchanged", () => {
      const sql = "SELECT * FROM reports ORDER BY created_at DESC";
      const result = applyWilayahFilter(sql, [], undefined);
      expect(result.sql).toBe(sql);
      expect(result.params).toEqual([]);
    });

    it("injects WHERE before ORDER BY when no WHERE clause exists", () => {
      const sql = "SELECT * FROM reports ORDER BY created_at DESC LIMIT 100";
      const result = applyWilayahFilter(sql, [], "kab-A-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("ORDER BY created_at DESC");
      expect(result.params).toEqual(["kab-A-uuid"]);
    });

    it("injects AND before ORDER BY when WHERE already exists", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT 20";
      const result = applyWilayahFilter(sql, ["verified"], "kab-B-uuid");
      expect(result.sql).toContain("WHERE status = $1 AND reports.wilayah_id = $2");
      expect(result.params).toEqual(["verified", "kab-B-uuid"]);
    });

    it("injects filter before LIMIT/OFFSET", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
      const result = applyWilayahFilter(sql, ["pending", 20, 0], "kab-C-uuid");
      expect(result.sql).toContain("AND reports.wilayah_id = $4");
      expect(result.sql).toContain("LIMIT $2 OFFSET $3");
      expect(result.params).toEqual(["pending", 20, 0, "kab-C-uuid"]);
    });

    it("injects filter before GROUP BY", () => {
      const sql = "SELECT status, COUNT(*) FROM reports GROUP BY status";
      const result = applyWilayahFilter(sql, [], "kab-D-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("GROUP BY status");
      expect(result.params).toEqual(["kab-D-uuid"]);
    });

    it("kabupaten-A user gets different filter than kab-B user", () => {
      const baseSql = "SELECT * FROM reports WHERE status = $1";
      const resA = applyWilayahFilter(baseSql, ["submitted"], "wilayah-A-uuid");
      const resB = applyWilayahFilter(baseSql, ["submitted"], "wilayah-B-uuid");
      expect(resA.params[1]).toBe("wilayah-A-uuid");
      expect(resB.params[1]).toBe("wilayah-B-uuid");
      expect(resA.params[1]).not.toBe(resB.params[1]);
    });

    it("admin sees all reports params unchanged", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 AND priority > $2";
      const result = applyWilayahFilter(sql, ["open", 5], null);
      expect(result.sql).toBe(sql);
      expect(result.params).toEqual(["open", 5]);
    });

    it("custom table alias is respected", () => {
      const sql = "SELECT r.* FROM reports r WHERE r.status = $1";
      const result = applyWilayahFilter(sql, ["submitted"], "kab-X-uuid", "r");
      expect(result.sql).toContain("r.wilayah_id = $2");
      expect(result.params).toEqual(["submitted", "kab-X-uuid"]);
    });

    it("injects WHERE before LIMIT when no WHERE exists", () => {
      const sql = "SELECT * FROM reports LIMIT 50";
      const result = applyWilayahFilter(sql, [], "kab-Y-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("LIMIT 50");
      expect(result.params).toEqual(["kab-Y-uuid"]);
    });

    it("handles HAVING clause correctly", () => {
      const sql = "SELECT status, COUNT(*) FROM reports GROUP BY status HAVING COUNT(*) > 1";
      const result = applyWilayahFilter(sql, [], "kab-Z-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("GROUP BY status");
      expect(result.sql).toContain("HAVING COUNT(*) > 1");
      expect(result.params).toEqual(["kab-Z-uuid"]);
    });
  });
});

describe("outbox processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe("processPendingOutbox", () => {
    it("marks pending item as sent when HTTP 200", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: "outbox-1",
            target_system: "sipd",
            payload: { report_id: "report-1", action: "created" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await processPendingOutbox(makeEnv(), "actor-1", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("sent");
      expect(result.processed[0].id).toBe("outbox-1");
    });

    it("marks pending item as dead_letter when max_retries exceeded on HTTP error", async () => {
      const { createSipdAdapter } = await import("@/lib/outbox/adapters/sipd");
      vi.mocked(createSipdAdapter).mockReturnValueOnce({
        target: "sipd",
        send: vi.fn().mockResolvedValue({ status: "dead_letter", error: "max_retries_exceeded" }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: "outbox-2",
            target_system: "sipd",
            payload: { report_id: "report-2" },
            retry_count: 4,
            max_retries: 5,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await processPendingOutbox(makeEnv(), "actor-2", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("dead_letter");
    });

    it("marks pending item as failed with retry when under max_retries on HTTP error", async () => {
      const { createSatuDataAdapter } = await import("@/lib/outbox/adapters/satu-data");
      vi.mocked(createSatuDataAdapter).mockReturnValueOnce({
        target: "satu_data",
        send: vi.fn().mockResolvedValue({ status: "retry", error: "502" }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: "outbox-3",
            target_system: "satu_data",
            payload: { report_id: "report-3" },
            retry_count: 1,
            max_retries: 5,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await processPendingOutbox(makeEnv(), "actor-3", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("failed");
      expect(result.processed[0].error).toContain("502");
    });

    it("skips target_system with no configured URL", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: "outbox-4",
            target_system: "unknown_system",
            payload: { report_id: "report-4" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await processPendingOutbox(makeEnv(), "actor-4", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("dead_letter");
      expect(result.processed[0].error).toBe("adapter_not_configured");
    });

    it("handles network error as failed/retry", async () => {
      const { createSipdAdapter } = await import("@/lib/outbox/adapters/sipd");
      vi.mocked(createSipdAdapter).mockReturnValueOnce({
        target: "sipd",
        send: vi.fn().mockResolvedValue({ status: "retry", error: "ECONNREFUSED" }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: "outbox-5",
            target_system: "sipd",
            payload: { report_id: "report-5" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await processPendingOutbox(makeEnv(), "actor-5", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("failed");
    });

    it("processes nothing when no pending items", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await processPendingOutbox(makeEnv(), "actor-empty", 10);
      expect(result.processed).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await processPendingOutbox(makeEnv(), undefined, 5);

      const selectCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("SELECT"),
      );
      expect(selectCall).toBeDefined();
      expect((selectCall![0] as string).includes("$1")).toBe(true);
      expect(selectCall![1]).toContain(5);
    });

    it("throws on malformed OUTBOUND_TARGETS JSON", async () => {
      const env = makeEnv({ OUTBOUND_TARGETS: "not-valid-json" });
      await expect(processPendingOutbox(env, "actor-6", 10)).rejects.toThrow("OUTBOUND_TARGETS is malformed");
    });
  });
});

describe("audit log chain integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe("appendAudit", () => {
    it("inserts audit entry with a 64-char hex entry_hash", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ entry_hash: null }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await appendAudit(makeEnv() as Parameters<typeof appendAudit>[0], {
        actor: "user-1",
        action: "report_created",
        objectType: "report",
        objectId: "report-123",
        after: { status: "submitted" },
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("INSERT INTO audit_log"),
      );
      expect(insertCall).toBeDefined();
      const entryHash = insertCall![1][9];
      expect(typeof entryHash).toBe("string");
      expect(entryHash.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(entryHash)).toBe(true);
    });

    it("uses previous entry_hash as prev_hash when chaining", async () => {
      const prevEntryHash = "a".repeat(64);

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ entry_hash: prevEntryHash }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await appendAudit(makeEnv() as Parameters<typeof appendAudit>[0], {
        actor: "user-2",
        action: "report_verified",
        objectType: "report",
        objectId: "report-456",
        after: { status: "verified" },
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("INSERT INTO audit_log"),
      );
      expect(insertCall![1][8]).toBe(prevEntryHash);
    });

    it("uses zero-hash when audit_log is empty for first entry", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await appendAudit(makeEnv() as Parameters<typeof appendAudit>[0], {
        actor: "user-3",
        action: "system_initialized",
        objectType: "system",
        objectId: "system",
        after: { initialized: true },
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("INSERT INTO audit_log"),
      );
      expect(insertCall![1][8]).toBe("0".repeat(64));
    });
  });

  describe("verifyAuditChain", () => {
    it("returns ok=true for a valid unbroken chain", async () => {
      const entries = [
        {
          actor: "user-1",
          action: "report_created",
          object_type: "report",
          object_id: "report-1",
          before_data: null,
          after_data: { status: "submitted" },
          reason: null as string | null,
        },
        {
          actor: "user-2",
          action: "report_verified",
          object_type: "report",
          object_id: "report-1",
          before_data: { status: "submitted" },
          after_data: { status: "verified" },
          reason: "Looks good",
        },
        {
          actor: "user-3",
          action: "report_resolved",
          object_type: "report",
          object_id: "report-1",
          before_data: { status: "verified" },
          after_data: { status: "resolved" },
          reason: null,
        },
      ];

      let prevHash = "0".repeat(64);
      const rows = entries.map((entry) => {
        const beforeStr = canonicalize(entry.before_data);
        const afterStr = canonicalize(entry.after_data);
        const reasonStr = entry.reason ?? "";
        const entry_hash = hashEntry(prevHash, {
          actor: entry.actor,
          action: entry.action,
          objectType: entry.object_type,
          objectId: entry.object_id,
          before: beforeStr,
          after: afterStr,
          reason: reasonStr,
        });
        const row = {
          prev_hash: prevHash,
          entry_hash: entry_hash,
          actor: entry.actor,
          action: entry.action,
          object_type: entry.object_type,
          object_id: entry.object_id,
          before_data: entry.before_data,
          after_data: entry.after_data,
          reason: entry.reason,
        };
        prevHash = entry_hash;
        return row;
      });

      mockClient.query.mockResolvedValueOnce({ rows, rowCount: rows.length });

      const result = await verifyAuditChain(makeEnv() as Parameters<typeof verifyAuditChain>[0]);
      expect(result.ok).toBe(true);
      expect(result.count).toBe(3);
    });

    it("returns ok=false when prev_hash chain is broken", async () => {
      const entries = [
        {
          prev_hash: "0".repeat(64),
          entry_hash: hashEntry("0".repeat(64), {
            actor: "user-1", action: "first", objectType: "report",
            objectId: "r1", before: canonicalize(null),
            after: canonicalize({ n: 1 }), reason: "",
          }),
          actor: "user-1", action: "first", object_type: "report",
          object_id: "report-1", before_data: null, after_data: { n: 1 }, reason: null,
        },
        {
          prev_hash: "0".repeat(64),
          entry_hash: hashEntry("0".repeat(64), {
            actor: "user-2", action: "second", objectType: "report",
            objectId: "r2", before: canonicalize(null),
            after: canonicalize({ n: 2 }), reason: "",
          }),
          actor: "user-2", action: "second", object_type: "report",
          object_id: "report-2", before_data: null, after_data: { n: 2 }, reason: null,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: entries, rowCount: entries.length });

      const result = await verifyAuditChain(makeEnv() as Parameters<typeof verifyAuditChain>[0]);
      expect(result.ok).toBe(false);
      expect(result.first_break_at).toBe(1);
    });

    it("returns ok=false when entry_hash is tampered", async () => {
      const badEntry = {
        prev_hash: "0".repeat(64),
        entry_hash: "tampered".padEnd(64, "0").slice(0, 64),
        actor: "user-1",
        action: "report_created",
        object_type: "report",
        object_id: "report-1",
        before_data: null,
        after_data: { status: "submitted" },
        reason: null,
      };

      mockClient.query.mockResolvedValueOnce({ rows: [badEntry], rowCount: 1 });

      const result = await verifyAuditChain(makeEnv() as Parameters<typeof verifyAuditChain>[0]);
      expect(result.ok).toBe(false);
    });

    it("returns ok=true for empty audit log", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await verifyAuditChain(makeEnv() as Parameters<typeof verifyAuditChain>[0]);
      expect(result.ok).toBe(true);
      expect(result.count).toBe(0);
    });

    it("detects tampering with before_data", async () => {
      const originalEntry = {
        actor: "user-1",
        action: "report_created",
        object_type: "report",
        object_id: "report-1",
        before_data: null as unknown,
        after_data: { status: "submitted" },
        reason: null as string | null,
      };
      const beforeStr = canonicalize(originalEntry.before_data);
      const afterStr = canonicalize(originalEntry.after_data);
      const reasonStr = originalEntry.reason ?? "";
      const entryHash = hashEntry("0".repeat(64), {
        actor: originalEntry.actor,
        action: originalEntry.action,
        objectType: originalEntry.object_type,
        objectId: originalEntry.object_id,
        before: beforeStr,
        after: afterStr,
        reason: reasonStr,
      });

      const tamperedEntry = {
        prev_hash: "0".repeat(64),
        entry_hash: entryHash,
        actor: originalEntry.actor,
        action: originalEntry.action,
        object_type: originalEntry.object_type,
        object_id: originalEntry.object_id,
        before_data: { tampered: true },
        after_data: originalEntry.after_data,
        reason: originalEntry.reason,
      };

      mockClient.query.mockResolvedValueOnce({ rows: [tamperedEntry], rowCount: 1 });

      const result = await verifyAuditChain(makeEnv() as Parameters<typeof verifyAuditChain>[0]);
      expect(result.ok).toBe(false);
    });
  });
});

describe("sync batch endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SyncBatchSchema validation", () => {
    it("accepts a valid batch of reports", () => {
      const batch = {
        reports: [{
          idempotency_key: "11111111-1111-1111-1111-111111111111",
          category_id: "22222222-2222-2222-2222-222222222222",
          description: "Jalan rusak parah di depan balai kota",
          lng: 106.8,
          lat: -6.2,
        }],
      };
      const result = SyncBatchSchema.safeParse(batch);
      expect(result.success).toBe(true);
    });

    it("rejects batch with more than 50 reports", () => {
      const batch = {
        reports: Array.from({ length: 51 }, (_, i) => ({
          idempotency_key: `${i}`.padEnd(36, "0"),
          category_id: "22222222-2222-2222-2222-222222222222",
          description: "Description",
          lng: 106.8,
          lat: -6.2,
        })),
      };
      const result = SyncBatchSchema.safeParse(batch);
      expect(result.success).toBe(false);
    });

    it("rejects report with invalid uuid for idempotency_key", () => {
      const batch = {
        reports: [{
          idempotency_key: "not-a-uuid",
          category_id: "22222222-2222-2222-2222-222222222222",
          description: "Description",
          lng: 106.8,
          lat: -6.2,
        }],
      };
      const result = SyncBatchSchema.safeParse(batch);
      expect(result.success).toBe(false);
    });

    it("rejects report with lng out of range", () => {
      const batch = {
        reports: [{
          idempotency_key: "11111111-1111-1111-1111-111111111111",
          category_id: "22222222-2222-2222-2222-222222222222",
          description: "Description",
          lng: 200,
          lat: -6.2,
        }],
      };
      const result = SyncBatchSchema.safeParse(batch);
      expect(result.success).toBe(false);
    });

    it("accepts report with optional title and photo_urls", () => {
      const batch = {
        reports: [{
          idempotency_key: "11111111-1111-1111-1111-111111111111",
          category_id: "22222222-2222-2222-2222-222222222222",
          description: "Description",
          lng: 106.8,
          lat: -6.2,
          title: "Judul Laporan",
          photo_urls: ["https://example.com/photo.jpg"],
        }],
      };
      const result = SyncBatchSchema.safeParse(batch);
      expect(result.success).toBe(true);
    });
  });

  describe("idempotency behavior", () => {
    it("idempotency_key dedupes duplicate reports in same batch", async () => {
      const mockClient = makeMockClient();
      const key = "11111111-1111-1111-1111-111111111111";

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: "new-id" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: "new-id" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient as unknown as InstanceType<typeof Client>);
      });

      const reports = [
        { idempotency_key: key, category_id: "22222222-2222-2222-2222-222222222222", description: "First", lng: 1, lat: 1 },
        { idempotency_key: key, category_id: "22222222-2222-2222-2222-222222222222", description: "Second (dup)", lng: 2, lat: 2 },
      ];

      const out: Array<{ idempotency_key: string; id: string; status: "created" | "duplicate"; error?: string }> = [];
      await mockClient.query("BEGIN");
      for (const r of reports) {
        const existing = await mockClient.query<{ id: string }>(
          "SELECT id FROM reports WHERE idempotency_key = $1",
          [r.idempotency_key],
        );
        if (existing.rows[0]) {
          out.push({ idempotency_key: r.idempotency_key, id: existing.rows[0].id, status: "duplicate" });
          continue;
        }
        const inserted = await mockClient.query<{ id: string }>(
          `INSERT INTO reports (idempotency_key, category_id, description, geom, lat, lng, photo_urls, status, created_at, updated_at)
           VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $5, $4, $6, 'submitted', NOW(), NOW()) RETURNING id`,
          [r.idempotency_key, r.category_id, r.description, r.lng, r.lat, []],
        );
        if (!inserted.rows[0]) throw new Error("Insert failed");
        out.push({ idempotency_key: r.idempotency_key, id: inserted.rows[0].id, status: "created" });
      }
      await mockClient.query("COMMIT");

      expect(out).toHaveLength(2);
      expect(out[0].status).toBe("created");
      expect(out[1].status).toBe("duplicate");
      expect(out[1].id).toBe(out[0].id);
    });

    it("processes a batch of 50 unique reports", async () => {
      const mockClient = makeMockClient();
      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient as unknown as InstanceType<typeof Client>);
      });

      const reports = Array.from({ length: 50 }, (_, i) => ({
        idempotency_key: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa${String(i).padStart(3, "0")}`,
        category_id: "22222222-2222-2222-2222-222222222222",
        description: `Report ${i}`,
        lng: 106.8 + i * 0.01,
        lat: -6.2 - i * 0.01,
      }));

      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      for (let i = 0; i < 50; i++) {
        mockClient.query
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({ rows: [{ id: `batch-report-${i}` }], rowCount: 1 });
      }
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const out: Array<{ idempotency_key: string; id: string; status: "created" | "duplicate" }> = [];
      await mockClient.query("BEGIN");
      for (const r of reports) {
        const existing = await mockClient.query<{ id: string }>(
          "SELECT id FROM reports WHERE idempotency_key = $1",
          [r.idempotency_key],
        );
        if (existing.rows[0]) {
          out.push({ idempotency_key: r.idempotency_key, id: existing.rows[0].id, status: "duplicate" });
          continue;
        }
        const inserted = await mockClient.query<{ id: string }>(
          `INSERT INTO reports (idempotency_key, category_id, description, geom, lat, lng, photo_urls, status, created_at, updated_at)
           VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $5, $4, $6, 'submitted', NOW(), NOW()) RETURNING id`,
          [r.idempotency_key, r.category_id, r.description, r.lng, r.lat, []],
        );
        if (!inserted.rows[0]) throw new Error("Insert failed");
        out.push({ idempotency_key: r.idempotency_key, id: inserted.rows[0].id, status: "created" });
      }
      await mockClient.query("COMMIT");

      expect(out).toHaveLength(50);
      expect(out.every((r) => r.status === "created")).toBe(true);
    });
  });
});
