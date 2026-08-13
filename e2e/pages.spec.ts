import { test as base, expect, createAuthedRequest } from "./api.js";
import { setAuth, clearAuth } from "./helpers/ui-auth.js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

const PUBLIC_ROUTES = [
  { path: "/", name: "PublicHome" },
  { path: "/methodology", name: "Methodology" },
  { path: "/case-list", name: "PublicCaseList" },
  { path: "/statistics", name: "PublicStatistics" },
  { path: "/admin/login", name: "AdminLogin" },
] as const;

const PROTECTED_ROUTES = [
  { path: "/admin", name: "AdminDashboard" },
  { path: "/admin/cases", name: "AdminCaseList" },
  { path: "/admin/users", name: "AdminUsers" },
  { path: "/admin/categories", name: "AdminCategories" },
  { path: "/admin/wilayah", name: "AdminWilayah" },
  { path: "/admin/audit", name: "AdminAudit" },
  { path: "/admin/priority", name: "AdminPriorityConfig" },
  { path: "/admin/outbox", name: "AdminOutbox" },
  { path: "/admin/executive", name: "ExecDashboard" },
  { path: "/verifikator/queue", name: "VerifikatorQueue" },
  { path: "/verify", name: "VerifyReport" },
  { path: "/surveyor/tasks", name: "SurveyorTaskList" },
  { path: "/operator", name: "OperatorDashboard" },
  { path: "/petugas/tasks", name: "PetugasTasks" },
] as const;

const DYNAMIC_ROUTES = [
  { path: (id: string) => `/case/${id}`, name: "PublicCaseDetail", adminAuth: false },
  { path: (id: string) => `/admin/cases/${id}`, name: "AdminCaseDetail", adminAuth: true },
  { path: (id: string) => `/verifikator/cases/${id}`, name: "VerifikatorCaseReview", adminAuth: true },
  { path: (id: string) => `/surveyor/tasks/${id}`, name: "SurveyorTaskDetail", adminAuth: true },
] as const;

const WARGA_ROUTE = { path: "/warga/new", name: "WargaCreateReport" };

interface Fixtures {
  adminPage: { page: Awaited<ReturnType<typeof base["page"]>> };
  reportId: { id: string };
  surveyorTaskId: { id: string };
}

const adminFixtures = base.extend<Fixtures>({
  adminPage: async ({ page }, use) => {
    await setAuth(page, "ADMIN");
    await use({ page });
    await clearAuth(page);
  },
  reportId: async ({}, use) => {
    const api = await createAuthedRequest("ADMIN");
    const resp = await api.post(`${BASE_URL}/api/reports`, {
      data: {
        idempotency_key: "00000000-0000-0000-0000-000000009101",
        category_id: "00000000-0000-0000-0000-000000000002",
        description: "E2E test report for page load verification",
        lat: -6.5,
        lng: 106.85,
      },
    });
    await api.dispose();
    const body = (await resp.json()) as { id?: string; error?: unknown };
    const id = body.id ?? "00000000-0000-0000-0000-000000009101";
    await use({ id });
  },
  surveyorTaskId: async ({ reportId }, use) => {
    const api = await createAuthedRequest("ADMIN");
    await api.post(`${BASE_URL}/api/reports/${reportId.id}/assign`, {
      data: { assigned_to: "00000000-0000-0000-0000-000000000001" },
    });
    const tasksResp = await api.get(`${BASE_URL}/api/surveyor/tasks`);
    await api.dispose();
    const tasksBody = (await tasksResp.json()) as { tasks?: Array<{ id: string }> };
    const taskId = tasksBody.tasks?.[0]?.id ?? "00000000-0000-0000-0000-000000009999";
    await use({ id: taskId });
  },
});

export { adminFixtures };

test.describe("T5.1 — All 22 web pages load without crash", () => {
  test.describe("Public routes — no auth required", () => {
    for (const route of PUBLIC_ROUTES) {
      test(route.name, async ({ page }) => {
        const resp = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
        expect(resp?.status()).toBe(200);
        await expect(page).not.toHaveURL(/\/admin\/login\?.*redirected/);
      });
    }
  });

  test.describe("Warga create report — no auth guard on route", () => {
    test(WARGA_ROUTE.name, async ({ page }) => {
      const resp = await page.goto(`${BASE_URL}${WARGA_ROUTE.path}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status()).toBe(200);
    });
  });

  test.describe("Protected routes — require auth (admin credentials)", () => {
    for (const route of PROTECTED_ROUTES) {
      test(route.name, async ({ adminPage }) => {
        const { page } = adminPage;
        const resp = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
        expect(resp?.status()).toBe(200);
        await expect(page).not.toHaveURL(/\/admin\/login/);
      });
    }
  });

  test.describe("Dynamic routes — require auth (admin credentials)", () => {
    test("PublicCaseDetail", async ({ adminPage, reportId }) => {
      const { page } = adminPage;
      const resp = await page.goto(`${BASE_URL}/case/${reportId.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status()).toBe(200);
    });

    test("AdminCaseDetail", async ({ adminPage, reportId }) => {
      const { page } = adminPage;
      const resp = await page.goto(`${BASE_URL}/admin/cases/${reportId.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status()).toBe(200);
      await expect(page).not.toHaveURL(/\/admin\/login/);
    });

    test("VerifikatorCaseReview", async ({ adminPage, reportId }) => {
      const { page } = adminPage;
      const resp = await page.goto(`${BASE_URL}/verifikator/cases/${reportId.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status()).toBe(200);
    });

    test("SurveyorTaskDetail", async ({ adminPage, surveyorTaskId }) => {
      const { page } = adminPage;
      const resp = await page.goto(`${BASE_URL}/surveyor/tasks/${surveyorTaskId.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status()).toBe(200);
    });
  });
});

test.describe("Unauthenticated users redirected to /admin/login", () => {
  const PROTECTED = [
    "/admin",
    "/admin/cases",
    "/admin/users",
    "/admin/categories",
    "/admin/wilayah",
    "/admin/audit",
    "/admin/priority",
    "/admin/outbox",
    "/admin/executive",
    "/verifikator/queue",
    "/verify",
    "/surveyor/tasks",
    "/operator",
    "/petugas/tasks",
  ];

  for (const path of PROTECTED) {
    test(`redirects unauthenticated from ${path}`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/login/);
    });
  }
});
