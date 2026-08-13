import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "pg";

vi.mock("@/lib/audit", () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockClient = {
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  withClient: vi.fn(async (_env: unknown, fn: (client: typeof mockClient) => Promise<unknown>) => {
    return await fn(mockClient as unknown as Client);
  }),
}));

const mockSipdAdapter = { send: vi.fn() };
const mockSatuDataAdapter = { send: vi.fn() };

vi.mock("@/lib/outbox/adapters/sipd", () => ({
  createSipdAdapter: vi.fn(() => mockSipdAdapter),
}));

vi.mock("@/lib/outbox/adapters/satu-data", () => ({
  createSatuDataAdapter: vi.fn(() => mockSatuDataAdapter),
}));

import { processPendingOutbox } from "../src/routes/api/outbox/process.ts";

function makeMockEnv(overrides: Partial<{ OUTBOUND_TARGETS: string }> = {}) {
  return {
    OUTBOUND_TARGETS: JSON.stringify({
      sipd: "https://sipd.example/api/notify",
      satu_data: "https://satu-data.example/api/ingest",
    }),
    ...overrides,
  } as Parameters<typeof processPendingOutbox>[0];
}

function setupQuery(...responses: unknown[]) {
  let callIndex = 0;
  mockClient.query.mockImplementation(() => Promise.resolve(responses[callIndex++]));
}

describe("outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.query.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }));
  });

  describe("enqueue (INSERT)", () => {
    it.skip("inserts a pending outbox record", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      const insertResult = await mockClient.query(
        `INSERT INTO outbox (target_system, payload, status, retry_count, next_retry_at)
         VALUES ($1, $2, 'pending', 0, NOW()) RETURNING id`,
        ["sipd", JSON.stringify({ report_id: "report-123", action: "created" })],
      );

      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0].id).toBeTruthy();
    });
  });

  describe("processPendingOutbox — sent", () => {
    it("marks as sent when HTTP response is 200", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-1",
            target_system: "sipd",
            payload: { report_id: "report-1" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      mockSipdAdapter.send.mockResolvedValue({ status: "sent" });

      const result = await processPendingOutbox(makeMockEnv(), "actor-1", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("sent");
    });

    it("moves to dead_letter when max_retries exceeded on HTTP error", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-2",
            target_system: "sipd",
            payload: { report_id: "report-2" },
            retry_count: 4,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      mockSipdAdapter.send.mockResolvedValue({ status: "retry", error: "500 Internal Server Error" });

      const result = await processPendingOutbox(makeMockEnv(), "actor-2", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("dead_letter");
    });

    it("moves to failed with retry when under max_retries on HTTP error", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-3",
            target_system: "satu_data",
            payload: { report_id: "report-3" },
            retry_count: 1,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      mockSatuDataAdapter.send.mockResolvedValue({ status: "retry", error: "502 Bad Gateway" });

      const result = await processPendingOutbox(makeMockEnv(), "actor-3", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("failed");
      expect(result.processed[0].error).toContain("502");
    });

    it("marks as dead_letter when target_system has no URL in OUTBOUND_TARGETS", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-4",
            target_system: "unknown_system",
            payload: { report_id: "report-4" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      const result = await processPendingOutbox(makeMockEnv(), "actor-4", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("dead_letter");
      expect(result.processed[0].error).toBe("adapter_not_configured");
    });

    it("handles network error as failed/retry", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-5",
            target_system: "generic_target",
            payload: { report_id: "report-5" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      try {
        const result = await processPendingOutbox(makeMockEnv({
          OUTBOUND_TARGETS: JSON.stringify({
            sipd: "https://sipd.example/api/notify",
            satu_data: "https://satu-data.example/api/ingest",
            generic_target: "https://generic.example/api/notify",
          }),
        }), "actor-5", 10);
        expect(result.processed).toHaveLength(1);
        expect(result.processed[0].status).toBe("failed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("respects limit parameter", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      await processPendingOutbox(makeMockEnv(), undefined, 5);

      const selectCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("SELECT"),
      );
      expect(selectCall).toBeDefined();
      expect((selectCall![0] as string).includes("$1")).toBe(true);
      expect(selectCall![1]).toContain(5);
    });

    it("parse_failed: throws when OUTBOUND_TARGETS is malformed JSON", async () => {
      await expect(
        processPendingOutbox(
          { OUTBOUND_TARGETS: "not json" } as Parameters<typeof processPendingOutbox>[0],
          "actor-1",
          10,
        ),
      ).rejects.toThrow(/OUTBOUND_TARGETS is malformed/);
    });

    it("parse_valid: works normally with valid JSON", async () => {
      setupQuery(
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      const result = await processPendingOutbox(makeMockEnv(), "actor-1", 10);
      expect(result.processed).toHaveLength(0);
    });
  });

  describe("processPendingOutbox — adapter_not_configured", () => {
    it("marks as dead_letter when SIPD adapter returns null", async () => {
      const { createSipdAdapter } = await import("@/lib/outbox/adapters/sipd");
      vi.mocked(createSipdAdapter).mockReturnValueOnce(null);

      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-adapter-1",
            target_system: "sipd",
            payload: { report_id: "report-adapter-1" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      const result = await processPendingOutbox(makeMockEnv(), "actor-adapter-1", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("dead_letter");
      expect(result.processed[0].error).toBe("adapter_not_configured");
    });

    it("marks as dead_letter when SatuData adapter returns null", async () => {
      const { createSatuDataAdapter } = await import("@/lib/outbox/adapters/satu-data");
      vi.mocked(createSatuDataAdapter).mockReturnValueOnce(null);

      setupQuery(
        { rows: [], rowCount: 0 },
        {
          rows: [{
            id: "outbox-adapter-2",
            target_system: "satu_data",
            payload: { report_id: "report-adapter-2" },
            retry_count: 0,
            max_retries: 5,
          }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      );

      const result = await processPendingOutbox(makeMockEnv(), "actor-adapter-2", 10);
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe("dead_letter");
      expect(result.processed[0].error).toBe("adapter_not_configured");
    });
  });
});
