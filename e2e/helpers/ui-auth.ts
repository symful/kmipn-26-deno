import { type Page } from "@playwright/test";
import { TEST_USERS, type TestUser } from "../api.js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

export async function setAuth(page: Page, role: TestUser["role"]): Promise<TestUser> {
  const user = TEST_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`No test user for role: ${role}`);

  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });

  if (!resp.ok()) {
    throw new Error(`Login failed for ${role}: ${resp.status()} ${await resp.text()}`);
  }

  const body = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; name: string; role: string; wilayah_id: string | null };
  };

  await page.evaluate(
    ({ access_token, refresh_token }) => {
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
    },
    { access_token: body.access_token, refresh_token: body.refresh_token }
  );

  const now = new Date().toISOString();
  const zustandState = {
    state: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      user: body.user,
    },
    version: 0,
    lastUpdated: now,
  };
  await page.evaluate(
    (zustandState) => {
      localStorage.setItem("sigap-auth", JSON.stringify(zustandState));
    },
    zustandState as unknown as string
  );

  return user;
}

export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("sigap-auth");
  });
}

export async function setAuthIfValid(page: Page, role: TestUser["role"]): Promise<boolean> {
  const user = TEST_USERS.find((u) => u.role === role);
  if (!user) return false;

  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });

  if (!resp.ok()) return false;

  const body = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; name: string; role: string; wilayah_id: string | null };
  };

  await page.evaluate(
    ({ access_token, refresh_token }) => {
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
    },
    { access_token: body.access_token, refresh_token: body.refresh_token }
  );

  const now = new Date().toISOString();
  const zustandState = {
    state: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      user: body.user,
    },
    version: 0,
    lastUpdated: now,
  };
  await page.evaluate(
    (zustandState) => {
      localStorage.setItem("sigap-auth", JSON.stringify(zustandState));
    },
    zustandState as unknown as string
  );

  return true;
}
