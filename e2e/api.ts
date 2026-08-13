import { test as base, request as PlaywrightRequest, type APIRequestContext } from "@playwright/test";
import { TEST_USERS } from "./helpers/auth.js";

export type TestUser = (typeof TEST_USERS)[number];
export type TestUserRole = TestUser["role"];

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

export async function createAuthedRequest(role: (typeof TEST_USERS)[number]["role"]): Promise<APIRequestContext> {
  const user = TEST_USERS.find(u => u.role === role);
  if (!user) throw new Error(`No test user for role: ${role}`);

  const api = await PlaywrightRequest.newContext({ baseURL: BASE_URL });

  const loginResp = await api.post("/api/auth/login", {
    data: { email: user.email, password: user.password },
  });
  if (!loginResp.ok()) {
    throw new Error(`Login failed for ${role}: ${loginResp.status()}`);
  }

  const { access_token } = await loginResp.json() as { access_token: string };

  await api.route("**", async (route, request) => {
    if (request.url().startsWith(BASE_URL + "/api/") && !request.headers()["authorization"]) {
      return route.continue({
        headers: { ...request.headers(), Authorization: `Bearer ${access_token}` },
      });
    }
    return route.continue();
  });

  return api;
}

export async function createAnonymousRequest(): Promise<APIRequestContext> {
  return PlaywrightRequest.newContext({ baseURL: BASE_URL });
}

export { base, expect } from "@playwright/test";
