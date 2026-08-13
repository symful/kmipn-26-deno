import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "pg";
import crypto from "node:crypto";

vi.mock("@/lib/db", () => ({
  withClient: vi.fn(),
}));

const mockWithClient = vi.mocked(
  // @ts-expect-error - module mock
  (await import("@/lib/db")).withClient,
);

import { appendAudit, verifyAuditChain } from "../src/lib/audit.ts";

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
    prevHash +
    "|" +
    entry.actor +
    "|" +
    entry.action +
    "|" +
    entry.objectType +
    "|" +
    entry.objectId +
    "|" +
    entry.before +
    "|" +
    entry.after +
    "|" +
    entry.reason;
  return crypto.createHash("sha256").update(data).digest("hex");
}

function makeMockClient() {
  return {
    query: vi.fn(),
    end: vi.fn(),
    connect: vi.fn(),
  } as unknown as InstanceType<typeof Client>;
}

function makeEnv() {
  return { JWT_SECRET: "test" } as Parameters<typeof appendAudit>[0];
}

describe("audit chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("appendAudit", () => {
    it("inserts an audit entry with computed hash", async () => {
      const mockClient = makeMockClient();
      const prevHash = "0".repeat(64);
      const entryHash = hashEntry(prevHash, {
        actor: "user-1",
        action: "report_created",
        objectType: "report",
        objectId: "report-123",
        before: canonicalize(null),
        after: canonicalize({ status: "submitted" }),
        reason: "",
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ entry_hash: null }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      await appendAudit(makeEnv(), {
        actor: "user-1",
        action: "report_created",
        objectType: "report",
        objectId: "report-123",
        after: { status: "submitted" },
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO audit_log"),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toContain(entryHash);
    });

    it("uses previous entry_hash as prev_hash when chaining", async () => {
      const mockClient = makeMockClient();
      const prevEntryHash = "abcd".repeat(16);

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ entry_hash: prevEntryHash }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      await appendAudit(makeEnv(), {
        actor: "user-2",
        action: "report_verified",
        objectType: "report",
        objectId: "report-456",
        after: { status: "verified" },
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO audit_log"),
      );
      expect(insertCall![1][8]).toBe(prevEntryHash);
    });
  });

  describe("verifyAuditChain", () => {
    it("returns true for a valid chain of entries", async () => {
      const mockClient = makeMockClient();

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
          reason: null as string | null,
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

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const result = await verifyAuditChain(makeEnv());
      expect(result.ok).toBe(true);
    });

    it("returns false when prev_hash is tampered", async () => {
      const mockClient = makeMockClient();

      const entries = [
        {
          prev_hash: "0".repeat(64),
          entry_hash: "tampered".padEnd(64, "0").slice(0, 64),
          actor: "user-1",
          action: "report_created",
          object_type: "report",
          object_id: "report-1",
          before_data: null,
          after_data: { status: "submitted" },
          reason: null,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: entries, rowCount: 1 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const result = await verifyAuditChain(makeEnv());
      expect(result.ok).toBe(false);
    });

    it("returns false when entry_hash does not match recomputed hash (tampered payload)", async () => {
      const mockClient = makeMockClient();

      const badEntry = {
        prev_hash: "0".repeat(64),
        entry_hash: "badbadbad".padEnd(64, "0").slice(0, 64),
        actor: "user-1",
        action: "report_created",
        object_type: "report",
        object_id: "report-1",
        before_data: null,
        after_data: { status: "submitted" },
        reason: null,
      };

      mockClient.query.mockResolvedValueOnce({ rows: [badEntry], rowCount: 1 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const result = await verifyAuditChain(makeEnv());
      expect(result.ok).toBe(false);
    });

    it("returns false when chain is broken (gap in prev_hash)", async () => {
      const mockClient = makeMockClient();

      const entries = [
        {
          prev_hash: "0".repeat(64),
          entry_hash: hashEntry(
            "0".repeat(64),
            {
              actor: "user-1",
              action: "first",
              objectType: "report",
              objectId: "r1",
              before: canonicalize(null),
              after: canonicalize({ n: 1 }),
              reason: "",
            },
          ),
          actor: "user-1",
          action: "first",
          object_type: "report",
          object_id: "report-1",
          before_data: null,
          after_data: { n: 1 },
          reason: null,
        },
        {
          prev_hash: "0".repeat(64),
          entry_hash: hashEntry(
            "0".repeat(64),
            {
              actor: "user-2",
              action: "second",
              objectType: "report",
              objectId: "r2",
              before: canonicalize(null),
              after: canonicalize({ n: 2 }),
              reason: "",
            },
          ),
          actor: "user-2",
          action: "second",
          object_type: "report",
          object_id: "report-2",
          before_data: null,
          after_data: { n: 2 },
          reason: null,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: entries, rowCount: 2 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const result = await verifyAuditChain(makeEnv());
      expect(result.ok).toBe(false);
    });

    it("returns true for an empty audit log", async () => {
      const mockClient = makeMockClient();
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockWithClient.mockImplementation(async (_env, fn) => {
        return await fn(mockClient);
      });

      const result = await verifyAuditChain(makeEnv());
      expect(result.ok).toBe(true);
    });
  });
});
