import { test, expect, createAuthedRequest } from "./api.js";

test.describe("C5.3 — Surveyor Task Detail", () => {
  let surveyorReq: Awaited<ReturnType<typeof createAuthedRequest>>;
  let adminReq: Awaited<ReturnType<typeof createAuthedRequest>>;

  test.beforeAll(async () => {
    surveyorReq = await createAuthedRequest("SURVEYOR");
    adminReq = await createAuthedRequest("ADMIN");
  });

  test.afterAll(async () => {
    await surveyorReq.dispose();
    await adminReq.dispose();
  });

  test("surveyor can GET /api/surveyor/tasks/:id and see full task + report", async () => {
    const reportResp = await adminReq.post("/api/reports", {
      data: {
        idempotency_key: "00000000-0000-0000-0000-000000005101",
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "Jalan berlubang berbahaya di jalan protokol",
        lat: -6.5,
        lng: 106.85,
      },
    });
    expect(reportResp.status()).toBe(200);
    const report = await reportResp.json() as { id: string };
    const reportId = report.id;

    const assignResp = await adminReq.post(`/api/reports/${reportId}/assign`, {
      data: {
        assigned_to: "00000000-0000-0000-0000-000000000001",
      },
    });
    expect(assignResp.status()).toBe(200);

    const taskListResp = await surveyorReq.get("/api/surveyor/tasks");
    expect(taskListResp.status()).toBe(200);
    const taskList = await taskListResp.json() as { tasks: Array<{ id: string; report_id: string }> };
    const task = taskList.tasks.find(t => t.report_id === reportId);
    const taskId = task?.id;
    if (!taskId) {
      throw new Error("No surveyor task found for assigned report — check assign.ts creates surveyor_tasks row");
    }

    const taskResp = await surveyorReq.get(`/api/surveyor/tasks/${taskId}`);
    expect(taskResp.status()).toBe(200);
    const taskDetail = await taskResp.json() as { task: Record<string, unknown> };
    expect(taskDetail.task).toHaveProperty("id");
    expect(taskDetail.task).toHaveProperty("report_description");
  });

  test("unauthenticated request returns 401", async () => {
    const resp = await fetch("http://localhost:8787/api/surveyor/tasks/00000000-0000-0000-0000-000000000999");
    expect(resp.status).toBe(401);
  });

  test("surveyor accessing another surveyor's task returns 404", async () => {
    const otherSurveyor = await createAuthedRequest("PETUGAS");
    try {
      const resp = await otherSurveyor.get("/api/surveyor/tasks/00000000-0000-0000-0000-000000000999");
      expect(resp.status()).toBe(404);
    } finally {
      await otherSurveyor.dispose();
    }
  });
});
