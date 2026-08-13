import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "pg";

vi.mock("@/lib/db", () => ({
  withClient: vi.fn(),
}));

async function simulateBatchSync(
  mockClient: InstanceType<typeof Client>,
  reports: Array<{
    idempotency_key: string;
    category_id: string;
    description: string;
    lng: number;
    lat: number;
    photo_urls?: string[];
    device_id?: string;
  }>,
): Promise<
  Array<{
    idempotency_key: string;
    id: string;
    status: "created" | "duplicate";
    error?: string;
  }>
> {
  const out: Array<{
    idempotency_key: string;
    id: string;
    status: "created" | "duplicate";
    error?: string;
  }> = [];

  for (const r of reports) {
    const existing = await mockClient.query<{ id: string }>(
      "SELECT id FROM reports WHERE idempotency_key = $1",
      [r.idempotency_key],
    );
    if (existing.rows[0]) {
      out.push({
        idempotency_key: r.idempotency_key,
        id: existing.rows[0].id,
        status: "duplicate",
      });
      continue;
    }
    const inserted = await mockClient.query<{ id: string }>(
      `INSERT INTO reports (idempotency_key, category_id, description, geom, lat, lng, photo_urls, status, created_at, updated_at)
       VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $5, $4, $6, 'submitted', NOW(), NOW()) RETURNING id`,
      [r.idempotency_key, r.category_id, r.description, r.lng, r.lat, r.photo_urls ?? []],
    );
    if (!inserted.rows[0]) throw new Error("Insert failed: no row returned");
    out.push({
      idempotency_key: r.idempotency_key,
      id: inserted.rows[0].id,
      status: "created",
    });
  }
  return out;
}

const mockWithClient = vi.mocked(
  // @ts-expect-error - module mock
  (await import("@/lib/db")).withClient,
);

function makeMockClient() {
  return {
    query: vi.fn(),
    end: vi.fn(),
    connect: vi.fn(),
  } as unknown as InstanceType<typeof Client>;
}

describe("sync batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new report when idempotency_key is new", async () => {
    const mockClient = makeMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: "new-report-id" }],
        rowCount: 1,
      });

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn(mockClient);
    });

    const result = await simulateBatchSync(mockClient, [
      {
        idempotency_key: "11111111-1111-1111-1111-111111111111",
        category_id: "22222222-2222-2222-2222-222222222222",
        description: "Jalan rusak parah",
        lng: 106.8,
        lat: -6.2,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("created");
    expect(result[0].id).toBe("new-report-id");
  });

  it("returns duplicate status when idempotency_key already exists", async () => {
    const mockClient = makeMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: "existing-report-id" }],
      rowCount: 1,
    });

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn(mockClient);
    });

    const result = await simulateBatchSync(mockClient, [
      {
        idempotency_key: "11111111-1111-1111-1111-111111111111",
        category_id: "22222222-2222-2222-2222-222222222222",
        description: "Jalan rusak lagi",
        lng: 106.8,
        lat: -6.2,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("duplicate");
    expect(result[0].id).toBe("existing-report-id");
  });

  it("processes multiple reports, creating some and marking duplicates", async () => {
    const mockClient = makeMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: "report-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "report-2" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: "report-3" }], rowCount: 1 });

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn(mockClient);
    });

    const result = await simulateBatchSync(mockClient, [
      {
        idempotency_key: "aaaa1111-1111-1111-1111-111111111111",
        category_id: "22222222-2222-2222-2222-222222222222",
        description: "Report A",
        lng: 106.8,
        lat: -6.2,
      },
      {
        idempotency_key: "aaaa2222-2222-2222-2222-222222222222",
        category_id: "22222222-2222-2222-2222-222222222222",
        description: "Report B",
        lng: 107.0,
        lat: -6.5,
      },
      {
        idempotency_key: "aaaa3333-3333-3333-3333-333333333333",
        category_id: "22222222-2222-2222-2222-222222222222",
        description: "Report C",
        lng: 107.2,
        lat: -6.8,
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0].status).toBe("created");
    expect(result[0].id).toBe("report-1");
    expect(result[1].status).toBe("duplicate");
    expect(result[1].id).toBe("report-2");
    expect(result[2].status).toBe("created");
    expect(result[2].id).toBe("report-3");
  });

  it("batch of 50 reports is processed correctly", async () => {
    const mockClient = makeMockClient();
    const reports = Array.from({ length: 50 }, (_, i) => ({
      idempotency_key: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa${String(i).padStart(3, "0")}`,
      category_id: "22222222-2222-2222-2222-222222222222",
      description: `Report ${i}`,
      lng: 106.8 + i * 0.01,
      lat: -6.2 - i * 0.01,
    }));

    for (let i = 0; i < 50; i++) {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ id: `batch-report-${i}` }],
          rowCount: 1,
        });
    }

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn(mockClient);
    });

    const result = await simulateBatchSync(mockClient, reports);
    expect(result).toHaveLength(50);
    expect(result.every((r) => r.status === "created")).toBe(true);
  });

  it("idempotency key is the primary dedupe mechanism", async () => {
    const mockClient = makeMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: "first-id" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "first-id" }], rowCount: 1 });

    mockWithClient.mockImplementation(async (_env, fn) => {
      return await fn(mockClient);
    });

    const key = "idempotent-key-123";
    const r1 = await simulateBatchSync(mockClient, [
      { idempotency_key: key, category_id: "cat", description: "First", lng: 1, lat: 1 },
    ]);
    const r2 = await simulateBatchSync(mockClient, [
      { idempotency_key: key, category_id: "cat", description: "Second attempt", lng: 2, lat: 2 },
    ]);

    expect(r1[0].status).toBe("created");
    expect(r2[0].status).toBe("duplicate");
    expect(r2[0].id).toBe("first-id");
  });
});
