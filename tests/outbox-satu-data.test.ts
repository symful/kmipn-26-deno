import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SatuDataAdapter, createSatuDataAdapter } from "../src/lib/outbox/adapters/satu-data.ts";

const TEST_URL = "https://satudata.example.com/api/reports";
const TEST_TOKEN = "test-bearer-token-12345";

describe("SatuDataAdapter", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("send", () => {
    it("sends POST with Authorization header", async () => {
      let capturedUrl = "";
      let capturedHeaders: Headers | null = null;
      globalThis.fetch = async (url: string | Request | URL, options?: RequestInit) => {
        capturedUrl = url.toString();
        capturedHeaders = new Headers(options?.headers);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      const payload = {
        kode_referensi_wilayah: "32.01.01",
        kode_referensi_kategori: "JALAN_RUSAK",
        status: "verified",
        provenance: "SIGAP",
        timestamp: "2026-08-12T10:00:00Z",
        geometry: { type: "Point" as const, coordinates: [107.619, -6.917] },
      };

      await adapter.send(payload);

      expect(capturedUrl).toBe(TEST_URL);
      expect(capturedHeaders.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
      expect(capturedHeaders.get("Content-Type")).toBe("application/json");
    });

    it("returns sent on 2xx response", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ id: 1 }), { status: 201 });

      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      const result = await adapter.send({ test: "payload" });

      expect(result.status).toBe("sent");
      expect(result.error).toBeUndefined();
    });

    it("returns retry on 5xx response", async () => {
      globalThis.fetch = async () =>
        new Response("Internal Server Error", { status: 500 });

      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      const result = await adapter.send({ test: "payload" });

      expect(result.status).toBe("retry");
      expect(result.error).toBe("http_error: 500");
    });

    it("returns dead_letter on 4xx response", async () => {
      globalThis.fetch = async () =>
        new Response("Not Found", { status: 404 });

      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      const result = await adapter.send({ test: "payload" });

      expect(result.status).toBe("dead_letter");
      expect(result.error).toBe("http_client_error: 404");
    });

    it("returns retry on network error", async () => {
      globalThis.fetch = async () => {
        throw new Error("Connection refused");
      };

      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      const result = await adapter.send({ test: "payload" });

      expect(result.status).toBe("retry");
      expect(result.error).toContain("network_error:");
    });

    it("sends payload as JSON body", async () => {
      let capturedBody = "";
      globalThis.fetch = async (url: string | Request | URL, options?: RequestInit) => {
        capturedBody = options?.body as string ?? "";
        return new Response("{}", { status: 200 });
      };

      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      const payload = {
        kode_referensi_wilayah: "32.01.01",
        kode_referensi_kategori: "JALAN_RUSAK",
        status: "verified",
        provenance: "SIGAP",
        timestamp: "2026-08-12T10:00:00Z",
        geometry: { type: "Point" as const, coordinates: [107.619, -6.917] },
      };

      await adapter.send(payload);

      const parsed = JSON.parse(capturedBody);
      expect(parsed.kode_referensi_wilayah).toBe("32.01.01");
      expect(parsed.geometry.type).toBe("Point");
    });
  });

  describe("createSatuDataAdapter", () => {
    it("returns adapter when env vars are present", () => {
      const env = {
        SATU_DATA_ENDPOINT_URL: TEST_URL,
        SATU_DATA_TOKEN: TEST_TOKEN,
      } as any;

      const adapter = createSatuDataAdapter(env);

      expect(adapter).not.toBeNull();
      expect(adapter?.target).toBe("satu_data");
    });

    it("returns null when SATU_DATA_ENDPOINT_URL is missing", () => {
      const env = {
        SATU_DATA_TOKEN: TEST_TOKEN,
      } as any;

      const adapter = createSatuDataAdapter(env);

      expect(adapter).toBeNull();
    });

    it("returns null when SATU_DATA_TOKEN is missing", () => {
      const env = {
        SATU_DATA_ENDPOINT_URL: TEST_URL,
      } as any;

      const adapter = createSatuDataAdapter(env);

      expect(adapter).toBeNull();
    });

    it("returns null when both env vars are missing", () => {
      const env = {} as any;

      const adapter = createSatuDataAdapter(env);

      expect(adapter).toBeNull();
    });
  });

  describe("target field", () => {
    it("has target equal to satu_data", () => {
      const adapter = new SatuDataAdapter(TEST_URL, TEST_TOKEN);
      expect(adapter.target).toBe("satu_data");
    });
  });
});
