/**
 * Satu Data Outbound Adapter
 *
 * Sends outbound payloads to Satu Data endpoint with Bearer token authentication.
 * Retry semantics are handled by the outbox processor (process.ts) which
 * manages the outbox DB state based on the status returned by this adapter.
 */

import type { Env } from "@/types/bindings";

/** Satu Data-compliant outbound payload shape */
export interface SatuDataPayload {
  kode_referensi_wilayah: string;
  kode_referensi_kategori: string;
  status: string;
  provenance: string;
  timestamp: string;
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
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

/** Satu Data adapter that sends payloads to SATU_DATA_ENDPOINT_URL with Bearer token */
export class SatuDataAdapter implements OutboundAdapter {
  target = "satu_data";

  constructor(
    private readonly endpointUrl: string,
    private readonly bearerToken: string
  ) {}

  async send(payload: unknown): Promise<SendResult> {
    let resp: Response;
    try {
      resp = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify(payload),
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
 * Factory: build a SatuDataAdapter from Env bindings.
 * Returns null if required env vars are missing (dev/preview safe).
 */
export function createSatuDataAdapter(env: Env): OutboundAdapter | null {
  const url = env.SATU_DATA_ENDPOINT_URL;
  const token = env.SATU_DATA_TOKEN;
  if (!url || !token) return null;
  return new SatuDataAdapter(url, token);
}
