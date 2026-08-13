import { test as base, expect } from "./api.js";
import { setAuth, clearAuth } from "./helpers/ui-auth.js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

const ADMIN_ONLY = [
  "/admin",
  "/admin/cases",
  "/admin/users",
  "/admin/categories",
  "/admin/wilayah",
  "/admin/audit",
  "/admin/priority",
  "/admin/outbox",
];

const EXEC_ROLES = ["PENGAMBIL_KEPUTUSAN", "ADMIN"] as const;
const VERIFIKATOR_ROLES = ["VERIFIKATOR", "ADMIN"] as const;
const SURVEYOR_ROLES = ["SURVEYOR", "ADMIN"] as const;
const RT_RW_ROLES = ["RT_RW", "ADMIN"] as const;
const OPERATOR_ROLES = ["OPERATOR", "ADMIN"] as const;
const PETUGAS_ROLES = ["PETUGAS", "ADMIN"] as const;

interface Fixtures {
  adminPage: { page: Awaited<ReturnType<typeof base["page"]>> };
}

const adminFixtures = base.extend<Fixtures>({
  adminPage: async ({ page }, use) => {
    await setAuth(page, "ADMIN");
    await use({ page });
    await clearAuth(page);
  },
});

type Fixtures = typeof adminFixtures;

export { adminFixtures };

async function checkNoLoginRedirect(page: Awaited<ReturnType<typeof base["page"]>>, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  const url = page.url();
  expect(url).not.toMatch(/\/admin\/login/);
}

async function checkLoginRedirect(page: Awaited<ReturnType<typeof base["page"]>>, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/login/);
}

test.describe("Role guard — ADMIN has access to all protected routes", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "ADMIN");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`admin can access ${path}`, async ({ page }) => {
      await checkNoLoginRedirect(page, path);
    });
  }

  test("admin can access /admin/executive", async ({ page }) => {
    await checkNoLoginRedirect(page, "/admin/executive");
  });

  test("admin can access /verifikator/queue", async ({ page }) => {
    await checkNoLoginRedirect(page, "/verifikator/queue");
  });

  test("admin can access /verify", async ({ page }) => {
    await checkNoLoginRedirect(page, "/verify");
  });

  test("admin can access /surveyor/tasks", async ({ page }) => {
    await checkNoLoginRedirect(page, "/surveyor/tasks");
  });

  test("admin can access /operator", async ({ page }) => {
    await checkNoLoginRedirect(page, "/operator");
  });

  test("admin can access /petugas/tasks", async ({ page }) => {
    await checkNoLoginRedirect(page, "/petugas/tasks");
  });
});

test.describe("Role guard — VERIFIKATOR", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "VERIFIKATOR");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`verifikator CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("verifikator can access /verifikator/queue", async ({ page }) => {
    await checkNoLoginRedirect(page, "/verifikator/queue");
  });

  test("verifikator cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("verifikator cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("verifikator cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });

  test("verifikator cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});

test.describe("Role guard — SURVEYOR", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "SURVEYOR");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`surveyor CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("surveyor can access /surveyor/tasks", async ({ page }) => {
    await checkNoLoginRedirect(page, "/surveyor/tasks");
  });

  test("surveyor cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("surveyor cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("surveyor cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });

  test("surveyor cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});

test.describe("Role guard — RT_RW", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "RT_RW");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`rt_rw CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("rt_rw can access /verify", async ({ page }) => {
    await checkNoLoginRedirect(page, "/verify");
  });

  test("rt_rw cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("rt_rw cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("rt_rw cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("rt_rw cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });
});

test.describe("Role guard — OPERATOR", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "OPERATOR");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`operator CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("operator can access /operator", async ({ page }) => {
    await checkNoLoginRedirect(page, "/operator");
  });

  test("operator cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("operator cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("operator cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });

  test("operator cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});

test.describe("Role guard — PETUGAS", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "PETUGAS");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`petugas CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("petugas can access /petugas/tasks", async ({ page }) => {
    await checkNoLoginRedirect(page, "/petugas/tasks");
  });

  test("petugas cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("petugas cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("petugas cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("petugas cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});

test.describe("Role guard — PENGAMBIL_KEPUTUSAN", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "PENGAMBIL_KEPUTUSAN");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`pengambil_keputusan CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("pengambil_keputusan can access /admin/executive", async ({ page }) => {
    await checkNoLoginRedirect(page, "/admin/executive");
  });

  test("pengambil_keputusan cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("pengambil_keputusan cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("pengambil_keputusan cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("pengambil_keputusan cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });

  test("pengambil_keputusan cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});

test.describe("Role guard — ADMIN_DAERAH (limited access)", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "ADMIN_DAERAH");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`admin_daerah CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("admin_daerah cannot access /admin/executive", async ({ page }) => {
    await checkLoginRedirect(page, "/admin/executive");
  });

  test("admin_daerah cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("admin_daerah cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("admin_daerah cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("admin_daerah cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });

  test("admin_daerah cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});

test.describe("Role guard — AUDITOR (limited access)", () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, "AUDITOR");
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  for (const path of ADMIN_ONLY) {
    test(`auditor CANNOT access ${path}`, async ({ page }) => {
      await checkLoginRedirect(page, path);
    });
  }

  test("auditor cannot access /admin/executive", async ({ page }) => {
    await checkLoginRedirect(page, "/admin/executive");
  });

  test("auditor cannot access /verifikator/queue", async ({ page }) => {
    await checkLoginRedirect(page, "/verifikator/queue");
  });

  test("auditor cannot access /surveyor/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/surveyor/tasks");
  });

  test("auditor cannot access /operator", async ({ page }) => {
    await checkLoginRedirect(page, "/operator");
  });

  test("auditor cannot access /petugas/tasks", async ({ page }) => {
    await checkLoginRedirect(page, "/petugas/tasks");
  });

  test("auditor cannot access /verify", async ({ page }) => {
    await checkLoginRedirect(page, "/verify");
  });
});
