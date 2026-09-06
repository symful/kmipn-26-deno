import type { Env } from "@/types/bindings";

/** Report transport readiness only; endpoints alone do not constitute an adapter. */
export function integrationStatus(env: Env) {
  const config = env as unknown as Record<string, unknown>;
  return [
    {
      id: "satu_data",
      name: "Portal Satu Data Indonesia",
      setting: "SATU_DATA_ENDPOINT",
    },
    { id: "sipd", name: "SIPD Kemendagri", setting: "SIPD_ENDPOINT" },
    { id: "bps", name: "Sistem BPS", setting: "BPS_ENDPOINT" },
  ].map(({ id, name, setting }) => {
    const configured =
      typeof config[setting] === "string" &&
      String(config[setting]).trim().length > 0;
    return {
      id,
      name,
      configured,
      status: configured ? "unavailable" : "unconfigured",
      reason: configured
        ? "Alamat konektor tersedia, tetapi adaptor pengiriman belum tersedia."
        : "Konektor belum dikonfigurasi.",
      last_sync: null,
      records_sent: null,
    };
  });
}
