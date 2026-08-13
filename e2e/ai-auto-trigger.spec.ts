import { test, expect, createAnonymousRequest, createAuthedRequest } from "./api.js";

test.describe("C5.4 — AI Assess Auto-Trigger on Report Create", () => {
  let anon: Awaited<ReturnType<typeof createAnonymousRequest>>;
  let adminReq: Awaited<ReturnType<typeof createAuthedRequest>>;

  test.beforeAll(async () => {
    anon = await createAnonymousRequest();
    adminReq = await createAuthedRequest("ADMIN");
  });

  test.afterAll(async () => {
    await anon.dispose();
    await adminReq.dispose();
  });

  test("public report creation queues outbox event for AI assessment", async () => {
    const idempotencyKey = "00000000-0000-0000-0000-000000006001";

    const createResp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: idempotencyKey,
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Jalan rusak kritis di depan gedung pemerintahan daerah",
        lat: -6.6,
        lng: 106.9,
        device_id: "00000000-0000-0000-0000-00000000060a",
      },
    });
    expect(createResp.status()).toBe(200);
    const created = await createResp.json() as { id: string };
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const reportId = created.id;

    const outboxResp = await adminReq.get("/api/outbox");
    expect(outboxResp.status()).toBe(200);
    const outboxData = await outboxResp.json() as { outbox: Array<{ event_type: string; related_report_id: string }> };

    const reportEvents = outboxData.outbox.filter(e => e.related_report_id === reportId);
    expect(reportEvents.length).toBeGreaterThanOrEqual(1);
    expect(reportEvents.some(e => e.event_type === "report_created")).toBe(true);
  });

  test("batch sync also queues outbox event per report", async () => {
    const batch = {
      reports: [
        {
          idempotency_key: "00000000-0000-0000-0000-000000006101",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Banjir meluap di akses jalan menuju pasar tradisional",
          lat: -6.7,
          lng: 107.0,
          device_id: "00000000-0000-0000-0000-00000000061a",
        },
        {
          idempotency_key: "00000000-0000-0000-0000-000000006102",
          category_id: "00000000-0000-0000-0000-000000000002",
          description: "Longsor menutup setengah badan jalan di tikungan berbahaya",
          lat: -6.71,
          lng: 107.01,
          device_id: "00000000-0000-0000-0000-00000000061a",
        },
      ],
    };

    const resp = await anon.post("/api/public/sync/batch", { data: batch });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { results: Array<{ id: string }> };
    const [id1, id2] = [body.results[0]?.id, body.results[1]?.id];

    const outboxResp = await adminReq.get("/api/outbox");
    const outboxData = await outboxResp.json() as { outbox: Array<{ event_type: string; related_report_id: string }> };

    const eventsForId1 = outboxData.outbox.filter(e => e.related_report_id === id1);
    const eventsForId2 = outboxData.outbox.filter(e => e.related_report_id === id2);

    expect(eventsForId1.some(e => e.event_type === "report_created")).toBe(true);
    expect(eventsForId2.some(e => e.event_type === "report_created")).toBe(true);
  });
});
