import { test, expect, createAnonymousRequest, createAuthedRequest } from "./api.js";

test.describe("C5.5 — Outbox Coverage Verification", () => {
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

  async function getOutboxEntries(): Promise<Array<{ event_type: string; related_report_id: string; status: string }>> {
    const resp = await adminReq.get("/api/outbox?limit=200");
    const body = await resp.json() as { entries: Array<{ event_type: string; related_report_id: string; status: string }> };
    return body.entries ?? [];
  }

  test("1 — public report creation inserts report_created outbox entry", async () => {
    const key = "00000000-0000-0000-0000-000000007001";
    const createResp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: key,
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Jalan rusak kritis memerlukan perbaikan segera di kawasan",
        lat: -6.8,
        lng: 107.2,
        device_id: "00000000-0000-0000-0000-00000000070a",
      },
    });
    expect(createResp.status()).toBe(200);
    const { id: reportId } = await createResp.json() as { id: string };

    const entries = await getOutboxEntries();
    const createdEntry = entries.find(e => e.related_report_id === reportId && e.event_type === "report_created");
    expect(createdEntry).toBeDefined();
    expect(createdEntry?.status).toBe("pending");
  });

  test("2 — report assign inserts report_assigned outbox entry", async () => {
    const key = "00000000-0000-0000-0000-000000007002";
    const createResp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: key,
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Banjir meluap menutup badan jalan utama di区块",
        lat: -6.9,
        lng: 107.3,
        device_id: "00000000-0000-0000-0000-00000000070b",
      },
    });
    expect(createResp.status()).toBe(200);
    const { id: reportId } = await createResp.json() as { id: string };

    await adminReq.post(`/api/reports/${reportId}/accept`, { data: {} });
    const assignResp = await adminReq.post(`/api/reports/${reportId}/assign`, {
      data: { assigned_unit_id: "00000000-0000-0000-0000-000000000001" },
    });
    expect(assignResp.status()).toBe(200);

    const entries = await getOutboxEntries();
    const assignedEntry = entries.find(e => e.related_report_id === reportId && e.event_type === "report_assigned");
    expect(assignedEntry).toBeDefined();
  });

  test("3 — surveyor visit inserts survey_completed outbox entry", async () => {
    const key = "00000000-0000-0000-0000-000000007003";
    const createResp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: key,
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Dinding真崩塌威胁结构完整性和路人安全",
        lat: -7.0,
        lng: 107.4,
        device_id: "00000000-0000-0000-0000-00000000070c",
      },
    });
    expect(createResp.status()).toBe(200);
    const { id: reportId } = await createResp.json() as { id: string };

    await adminReq.post(`/api/reports/${reportId}/accept`, { data: {} });
    await adminReq.post(`/api/reports/${reportId}/assign`, {
      data: { assigned_unit_id: "00000000-0000-0000-0000-000000000001" },
    });

    const taskListResp = await adminReq.get("/api/surveyor/tasks");
    expect(taskListResp.status()).toBe(200);
    const taskData = await taskListResp.json() as { tasks: Array<{ id: string; report_id: string }> };
    const task = taskData.tasks?.find(t => t.report_id === reportId);
    expect(task).toBeDefined();

    const visitResp = await adminReq.post(`/api/surveyor/tasks/${task!.id}/visit`, {
      data: {
        findings: "confirmed damage — partial结构倒塌需要立即加固",
        checklist: [
          { item: "photo_documentation", checked: true },
          { item: "severity_assessment", checked: true },
        ],
        photo_urls: [],
      },
    });
    expect(visitResp.status()).toBe(200);

    const entries = await getOutboxEntries();
    const visitEntry = entries.find(e => e.related_report_id === reportId && e.event_type === "survey_completed");
    expect(visitEntry).toBeDefined();
  });

  test("4 — report close inserts report_closed outbox entry", async () => {
    const key = "00000000-0000-0000-0000-000000007004";
    const createResp = await anon.post("/api/public/reports", {
      data: {
        idempotency_key: key,
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Longsor ringan menutup satu lajur jalan desa",
        lat: -7.1,
        lng: 107.5,
        device_id: "00000000-0000-0000-0000-00000000070d",
      },
    });
    expect(createResp.status()).toBe(200);
    const { id: reportId } = await createResp.json() as { id: string };

    await adminReq.post(`/api/reports/${reportId}/accept`, { data: {} });
    await adminReq.post(`/api/reports/${reportId}/assign`, {
      data: { assigned_unit_id: "00000000-0000-0000-0000-000000000001" },
    });

    const taskListResp = await adminReq.get("/api/surveyor/tasks");
    const taskData = await taskListResp.json() as { tasks: Array<{ id: string; report_id: string }> };
    const task = taskData.tasks?.find(t => t.report_id === reportId);
    await adminReq.post(`/api/surveyor/tasks/${task!.id}/visit`, {
      data: { findings: "verified — no immediate danger", checklist: [], photo_urls: [] },
    });

    const resolveResp = await adminReq.post(`/api/reports/${reportId}/resolve`, { data: {} });
    const closeResp = await adminReq.post(`/api/reports/${reportId}/close`);
    expect(closeResp.status()).toBe(200);

    const entries = await getOutboxEntries();
    const closeEntry = entries.find(e => e.related_report_id === reportId && e.event_type === "report_closed");
    expect(closeEntry).toBeDefined();
  });

  test("5 — outbox processor POST /api/outbox/process processes pending entries", async () => {
    const entriesBefore = await getOutboxEntries();
    const pendingCount = entriesBefore.filter(e => e.status === "pending").length;

    const procResp = await adminReq.post("/api/outbox/process", {});
    expect(procResp.status()).toBe(200);
    const procBody = await procResp.json() as { processed: Array<{ id: string; status: string }> };
    expect(Array.isArray(procBody.processed)).toBe(true);

    const entriesAfter = await getOutboxEntries();
    const pendingAfter = entriesAfter.filter(e => e.status === "pending").length;
    expect(pendingAfter).toBeLessThanOrEqual(pendingCount);
  });
});
