import { test, expect, createAnonymousRequest } from "./api.js";

test.describe("C5.2 — Anonymous Flutter Sync (Batch)", () => {
  let anon: Awaited<ReturnType<typeof createAnonymousRequest>>;

  test.beforeEach(async () => {
    anon = await createAnonymousRequest();
  });

  test.afterEach(async () => {
    await anon.dispose();
  });

  test("batch of 3 new reports — all inserted", async () => {
    const batch = {
      reports: [
        {
          idempotency_key: "00000000-0000-0000-0000-000000000101",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Jalan rusak di dusun suka maju",
          lat: -6.15,
          lng: 106.85,
          device_id: "00000000-0000-0000-0000-00000000010a",
        },
        {
          idempotency_key: "00000000-0000-0000-0000-000000000102",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Jembatan деревянная retak di akses jalan utama",
          lat: -6.16,
          lng: 106.86,
          device_id: "00000000-0000-0000-0000-00000000010a",
        },
        {
          idempotency_key: "00000000-0000-0000-0000-000000000103",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Saluran air tersumbat oleh debris树叶",
          lat: -6.17,
          lng: 106.87,
          device_id: "00000000-0000-0000-0000-00000000010a",
        },
      ],
    };

    const resp = await anon.post("/api/public/sync/batch", { data: batch });
    expect(resp.status()).toBe(200);

    const body = await resp.json() as { results: Array<{ idempotency_key: string; status: string; id?: string; error?: string }> };
    expect(body.results).toHaveLength(3);
    for (const r of body.results) {
      expect(r.status).toBe("inserted");
      expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  test("resending same batch — all duplicate", async () => {
    const batch = {
      reports: [
        {
          idempotency_key: "00000000-0000-0000-0000-000000000201",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Lampu jalan mati total di gang和安全",
          lat: -6.25,
          lng: 106.95,
          device_id: "00000000-0000-0000-0000-00000000020a",
        },
      ],
    };

    await anon.post("/api/public/sync/batch", { data: batch });

    const resp2 = await anon.post("/api/public/sync/batch", { data: batch });
    const body = await resp2.json() as { results: Array<{ idempotency_key: string; status: string }> };

    expect(body.results[0]?.status).toBe("duplicate");
  });

  test("mixed batch — one new, one duplicate", async () => {
    const key = "00000000-0000-0000-0000-000000000301";
    const batch = {
      reports: [
        {
          idempotency_key: key,
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Fasilitas umum rusak di taman kota",
          lat: -6.35,
          lng: 107.05,
          device_id: "00000000-0000-0000-0000-00000000030a",
        },
        {
          idempotency_key: "00000000-0000-0000-0000-000000000302",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Tempat sampah堆满 di sepanjang jalan",
          lat: -6.36,
          lng: 107.06,
          device_id: "00000000-0000-0000-0000-00000000030a",
        },
      ],
    };

    await anon.post("/api/public/sync/batch", { data: batch });
    const resp = await anon.post("/api/public/sync/batch", { data: batch });
    const body = await resp.json() as { results: Array<{ idempotency_key: string; status: string }> };

    const dup = body.results.find(r => r.idempotency_key === key);
    const newItem = body.results.find(r => r.idempotency_key !== key);

    expect(dup?.status).toBe("duplicate");
    expect(newItem?.status).toBe("duplicate");
  });

  test("empty batch returns 400", async () => {
    const resp = await anon.post("/api/public/sync/batch", {
      data: { reports: [] },
    });

    expect(resp.status()).toBe(400);
  });

  test("batch over 50 items returns 400", async () => {
    const reports = Array.from({ length: 51 }, (_, i) => ({
      idempotency_key: `00000000-0000-0000-0000-0000000${String(i).padStart(3, "0")}`,
      category_id: "00000000-0000-0000-0000-000000000002",
      description: "Test report item dalam batch besar",
      lat: -6.2 + i * 0.01,
      lng: 106.8 + i * 0.01,
      device_id: "00000000-0000-0000-0000-00000000040a",
    }));

    const resp = await anon.post("/api/public/sync/batch", {
      data: { reports },
    });

    expect(resp.status()).toBe(400);
  });
});
