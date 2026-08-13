import { SipdAdapter, createSipdAdapter, type OutboundPayload } from "../src/lib/outbox/adapters/sipd.ts";

const { test } = await import("node:test");
const assert = await import("node:assert");

const VALID_PAYLOAD: OutboundPayload = {
  kode_wilayah: "32.01.01",
  kode_kategori: "JALAN_RUSAK",
  deskripsi: "Lubang di jalan protokol",
  lat: -6.9024,
  lng: 107.6186,
  foto_urls: ["https://r2.example.com/foto1.jpg"],
  status: "verified",
  prioritas: 2,
  timestamp: new Date("2026-08-12T10:00:00Z").toISOString(),
};

test("SipdAdapter target is 'sipd'", () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "secret-key");
  assert.strictEqual(adapter.target, "sipd");
});

test("SipdAdapter.send() returns sent on HTTP 200", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "secret-key");
  const mockFetch = (_url: string, init: RequestInit) => {
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    const result = await adapter.send(VALID_PAYLOAD);
    assert.strictEqual(result.status, "sent");
    assert.strictEqual(result.error, undefined);
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});

test("SipdAdapter.send() returns retry on HTTP 500", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "secret-key");
  const mockFetch = (_url: string, _init: RequestInit) => {
    return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    const result = await adapter.send(VALID_PAYLOAD);
    assert.strictEqual(result.status, "retry");
    assert.ok(result.error?.includes("500"));
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});

test("SipdAdapter.send() returns dead_letter on HTTP 400", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "secret-key");
  const mockFetch = (_url: string, _init: RequestInit) => {
    return Promise.resolve(new Response("Bad Request", { status: 400 }));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    const result = await adapter.send(VALID_PAYLOAD);
    assert.strictEqual(result.status, "dead_letter");
    assert.ok(result.error?.includes("400"));
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});

test("SipdAdapter.send() returns retry on network error", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "secret-key");
  const mockFetch = (_url: string, _init: RequestInit) => {
    return Promise.reject(new Error("DNS lookup failed"));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    const result = await adapter.send(VALID_PAYLOAD);
    assert.strictEqual(result.status, "retry");
    assert.ok(result.error?.includes("DNS lookup failed"));
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});

test("SipdAdapter.send() includes X-SIGAP-Signature header", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "test-secret-123");
  let capturedHeaders: Record<string, string> | null = null;
  const mockFetch = (url: string, init: RequestInit) => {
    capturedHeaders = init.headers as Record<string, string>;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    await adapter.send(VALID_PAYLOAD);
    assert.ok(capturedHeaders !== null, "headers should be captured");
    const sigHeader = capturedHeaders!["X-SIGAP-Signature"];
    assert.ok(sigHeader !== undefined, "X-SIGAP-Signature header must be present");
    assert.ok(sigHeader.startsWith("sha256="), "signature must start with sha256=");
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});

test("SipdAdapter.send() uses correct endpoint URL", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "secret-key");
  let capturedUrl: string | null = null;
  const mockFetch = (url: string, _init: RequestInit) => {
    capturedUrl = url;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    await adapter.send(VALID_PAYLOAD);
    assert.strictEqual(capturedUrl, "https://sipd.example.com/ingest");
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});

test("createSipdAdapter returns null when SIPD_ENDPOINT_URL is missing", () => {
  const result = createSipdAdapter({} as unknown as { SIPD_ENDPOINT_URL?: string; SIPD_HMAC_SECRET?: string });
  assert.strictEqual(result, null);
});

test("createSipdAdapter returns null when SIPD_HMAC_SECRET is missing", () => {
  const result = createSipdAdapter({ SIPD_ENDPOINT_URL: "https://sipd.example.com" } as unknown as { SIPD_ENDPOINT_URL?: string; SIPD_HMAC_SECRET?: string });
  assert.strictEqual(result, null);
});

test("createSipdAdapter returns adapter when both env vars are present", () => {
  const adapter = createSipdAdapter({
    SIPD_ENDPOINT_URL: "https://sipd.example.com/ingest",
    SIPD_HMAC_SECRET: "my-secret",
  } as unknown as { SIPD_ENDPOINT_URL?: string; SIPD_HMAC_SECRET?: string });
  assert.ok(adapter !== null);
  assert.strictEqual(adapter!.target, "sipd");
});

test("SipdAdapter.send() returns dead_letter on HMAC computation failure", async () => {
  const adapter = new SipdAdapter("https://sipd.example.com/ingest", "");
  const mockFetch = (_url: string, _init: RequestInit) => {
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const original = globalThis.fetch;
  try {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    const result = await adapter.send(VALID_PAYLOAD);
    assert.strictEqual(result.status, "dead_letter");
    assert.ok(result.error?.includes("hmac_computation_failed"));
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  }
});
