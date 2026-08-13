import { test, expect, createAnonymousRequest } from "./api.js";

test.describe("C5.1 — Public Submit (Anonymous Warga)", () => {
  let anon: Awaited<ReturnType<typeof createAnonymousRequest>>;

  test.beforeEach(async () => {
    anon = await createAnonymousRequest();
  });

  test.afterEach(async () => {
    await anon.dispose();
  });

  test("POST /api/public/reports creates a new report", async () => {
    const resp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: "00000000-0000-0000-0000-000000000001",
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Jalan rusak parah di depan balai desa X",
        lat: -6.2,
        lng: 106.8,
        device_id: "00000000-0000-0000-0000-00000000000a",
      },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json() as { id: string; duplicate: boolean };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.duplicate).toBe(false);
  });

  test("duplicate idempotency_key returns same id with duplicate:true", async () => {
    const key = "00000000-0000-0000-0000-000000000002";
    const payload = {
      idempotency_key: key,
      category_id: "00000000-0000-0000-0000-000000000002",
      description: "Jalan berlubang di RT 05",
      lat: -6.3,
      lng: 106.9,
      device_id: "00000000-0000-0000-0000-00000000000b",
    };

    const r1 = await anon.post("/api/public/reports", { data: payload });
    const b1 = await r1.json() as { id: string; duplicate: boolean };

    const r2 = await anon.post("/api/public/reports", { data: payload });
    const b2 = await r2.json() as { id: string; duplicate: boolean };

    expect(b1.id).toBe(b2.id);
    expect(b2.duplicate).toBe(true);
  });

  test("missing device_id returns 400", async () => {
    const resp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: "00000000-0000-0000-0000-000000000003",
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Test report description here",
        lat: -6.2,
        lng: 106.8,
      },
    });

    expect(resp.status()).toBe(400);
  });

  test("invalid idempotency_key (not UUID) returns 400", async () => {
    const resp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: "not-a-uuid",
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Test report description here",
        lat: -6.2,
        lng: 106.8,
        device_id: "00000000-0000-0000-0000-00000000000a",
      },
    });

    expect(resp.status()).toBe(400);
  });

  test("description too short returns 400", async () => {
    const resp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: "00000000-0000-0000-0000-000000000004",
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "pendek",
        lat: -6.2,
        lng: 106.8,
        device_id: "00000000-0000-0000-0000-00000000000a",
      },
    });

    expect(resp.status()).toBe(400);
  });
});
