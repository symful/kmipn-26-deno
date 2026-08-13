/**
 * SIPD Outbound Adapter
 *
 * Sends outbound payloads to SIPD endpoint with HMAC signature verification.
 * Retry semantics are handled by the outbox processor (process.ts) which
 * manages the outbox DB state based on the status returned by this adapter.
 */

import type { Env } from "@/types/bindings";

/** SIPD-compliant outbound payload shape */
export interface OutboundPayload {
  kode_wilayah: string;
  kode_kategori: string;
  deskripsi: string;
  lat: number;
  lng: number;
  foto_urls: string[];
  status: string;
  prioritas: number;
  timestamp: string;
}

export interface SendResult {
  status: "sent" | "retry" | "dead_letter";
  error?: string;
}

/** OutboundAdapter interface for external system integration */
export interface OutboundAdapter {
  target: string;
  send(payload: unknown): Promise<SendResult>;
}

/**
 * Compute HMAC-SHA256 hex digest of the payload using the given secret.
 * Uses Web Crypto API (available in Cloudflare Workers).
 */
async function computeHmacHex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const hexChunks: string[] = [];
  new Uint8Array(signature).forEach((b) => hexChunks.push(b.toString(16).padStart(2, "0")));
  return hexChunks.join("");
}

/** SIPD adapter that sends signed payloads to SIPD_ENDPOINT_URL */
export class SipdAdapter implements OutboundAdapter {
  target = "sipd";

  constructor(
    private readonly endpointUrl: string,
    private readonly hmacSecret: string
  ) {}

  async send(payload: unknown): Promise<SendResult> {
    const body = JSON.stringify(payload);

    let signature: string;
    try {
      signature = await computeHmacHex(body, this.hmacSecret);
    } catch (e) {
      return { status: "dead_letter", error: `hmac_computation_failed: ${String(e)}` };
    }

    let resp: Response;
    try {
      resp = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SIGAP-Signature": `sha256=${signature}`,
        },
        body,
      });
    } catch (e) {
      return { status: "retry", error: `network_error: ${String(e)}` };
    }

    if (resp.ok) {
      return { status: "sent" };
    }

    if (resp.status >= 500) {
      return { status: "retry", error: `http_error: ${resp.status}` };
    }

    return { status: "dead_letter", error: `http_client_error: ${resp.status}` };
  }
}

/**
 * Factory: build a SipdAdapter from Env bindings.
 * Throws if required env vars are missing.
 */
export function createSipdAdapter(env: Env): OutboundAdapter {
  const url = env.SIPD_ENDPOINT_URL;
  const secret = env.SIPD_HMAC_SECRET;
  if (!url) throw new Error("Missing SIPD_ENDPOINT_URL");
  if (!secret) throw new Error("Missing SIPD_HMAC_SECRET");
  return new SipdAdapter(url, secret);
}
