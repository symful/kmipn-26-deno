import type { Env } from "../types/bindings";

export interface ResolvedAddress {
  address: string;
  address_area: string;
  latitude: number;
  longitude: number;
  kelurahan?: string;
  kecamatan?: string;
  kabupaten?: string;
  provinsi?: string;
  source: "OpenStreetMap";
  attribution: string;
}
export class GeocodingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 404 | 429 | 502 | 503,
  ) {
    super(message);
  }
}
const cached = new Map<string, { expires: number; value: ResolvedAddress }>();
const pending = new Map<string, Promise<ResolvedAddress>>();
let nextRequestAt = 0;

/** Called for a selected point, never a periodic or bulk scan. No coordinate echo fallback. */
export async function reverseGeocode(
  env: Env,
  latitude: number,
  longitude: number,
): Promise<ResolvedAddress> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new GeocodingError(
      "INVALID_LOCATION",
      "Koordinat lokasi tidak valid.",
      400,
    );
  }
  if (!env.GEOCODING_API_URL)
    throw new GeocodingError(
      "GEOCODING_NOT_CONFIGURED",
      "Layanan pencarian alamat belum diaktifkan. Isi alamat secara manual.",
      503,
    );
  const base = new URL(env.GEOCODING_API_URL);
  if (base.protocol !== "https:")
    throw new GeocodingError(
      "GEOCODING_CONFIGURATION",
      "Layanan pencarian alamat harus menggunakan HTTPS.",
      503,
    );
  const key = `${base.origin}:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const hit = cached.get(key);
  if (hit && hit.expires > Date.now())
    return { ...hit.value, latitude, longitude };
  if (pending.has(key)) return pending.get(key)!;
  const request = (async () => {
    if (Date.now() < nextRequestAt)
      throw new GeocodingError(
        "GEOCODING_BUSY",
        "Pencarian alamat sedang berlangsung. Coba kembali sebentar lagi.",
        429,
      );
    nextRequestAt = Date.now() + 1100;
    const url = new URL("/reverse", base);
    url.search = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      limit: "1",
      radius: "1",
    }).toString();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "id",
          "User-Agent": "SIGAP/1.0 (infrastructure reporting)",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "manual",
      });
    } catch (error) {
      console.error(
        "[geocoding] Provider request failed",
        error instanceof Error ? error.message : "Unknown network error",
      );
      throw new GeocodingError(
        "GEOCODING_UNAVAILABLE",
        "Alamat belum berhasil ditemukan. Coba kembali atau isi alamat secara manual.",
        502,
      );
    }
    if (!response.ok)
      throw new GeocodingError(
        "GEOCODING_UNAVAILABLE",
        "Layanan pencarian alamat sedang tidak tersedia.",
        502,
      );
    const body: unknown = await response.json();
    const feature = (
      body as { features?: { properties?: Record<string, unknown> }[] }
    )?.features?.[0];
    const p = feature?.properties;
    if (!p)
      throw new GeocodingError(
        "ADDRESS_NOT_FOUND",
        "Alamat belum tercatat pada peta. Isi alamat secara manual.",
        404,
      );
    const field = (name: string) =>
      typeof p[name] === "string" ? String(p[name]).trim() : "";
    const street =
      field("street") || (field("type") === "street" ? field("name") : "");
    const parts = [
      street,
      field("district"),
      field("city"),
      field("county"),
      field("state"),
      field("country"),
    ].filter(Boolean);
    if (!parts.length && field("name")) parts.push(field("name"));
    const address = [...new Set(parts)].join(", ");
    if (!address)
      throw new GeocodingError(
        "ADDRESS_NOT_FOUND",
        "Alamat belum tercatat pada peta. Isi alamat secara manual.",
        404,
      );
    // Photon (Indonesia) returns unprefixed admin levels:
    // county = kecamatan, district = kelurahan/desa, city = kota/kabupaten,
    // state = provinsi. Prefixed names ("Kecamatan X") stay accepted as fallback.
    const kecamatan =
      field("county") || parts.find((v) => /^Kecamatan\s/i.test(v)) || "";
    const kelurahan =
      field("district") ||
      (["village", "hamlet"].includes(field("osm_value")) ? field("name") : "") ||
      parts.find((v) => /^(Desa|Kelurahan)\s/i.test(v)) ||
      "";
    const kabupaten =
      field("city") || parts.find((v) => /^(Kabupaten|Kota)\s/i.test(v)) || "";
    const provinsi = field("state");
    const value: ResolvedAddress = {
      address,
      address_area: address,
      latitude,
      longitude,
      ...(kelurahan ? { kelurahan } : {}),
      ...(kecamatan ? { kecamatan } : {}),
      ...(kabupaten ? { kabupaten } : {}),
      ...(provinsi ? { provinsi } : {}),
      source: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
    };
    if (cached.size >= 256) cached.delete(cached.keys().next().value!);
    cached.set(key, { expires: Date.now() + 86400000, value });
    return value;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

/**
 * Fills missing administrative fields on a freshly created report from the
 * reverse-geocoding API. Only fields the client left null/empty get filled;
 * provided values are never touched. Swallows all errors so geocoder outages
 * cannot fail report creation.
 */
export async function enrichReportLocation(
  env: Env,
  reportId: string,
  latitude: number,
  longitude: number,
  provided: {
    kecamatan?: string | null | undefined;
    kelurahan?: string | null | undefined;
    kabupaten?: string | null | undefined;
    provinsi?: string | null | undefined;
    address_area?: string | null | undefined;
  },
): Promise<void> {
  const pick = (v: string | null | undefined) =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  const providedKecamatan = pick(provided.kecamatan);
  const providedKelurahan = pick(provided.kelurahan);
  const providedKabupaten = pick(provided.kabupaten);
  const providedProvinsi = pick(provided.provinsi);
  const providedAddress = pick(provided.address_area);
  if (
    providedKecamatan &&
    providedKelurahan &&
    providedKabupaten &&
    providedProvinsi &&
    providedAddress
  ) {
    return;
  }
  try {
    const resolved = await reverseGeocode(env, latitude, longitude);
    await env.D1.prepare(
      `UPDATE reports SET
         kecamatan = ?,
         kelurahan = ?,
         kabupaten = ?,
         provinsi = ?,
         address_area = ?
       WHERE id = ?`,
    )
      .bind(
        providedKecamatan ?? resolved.kecamatan ?? null,
        providedKelurahan ?? resolved.kelurahan ?? null,
        providedKabupaten ?? resolved.kabupaten ?? null,
        providedProvinsi ?? resolved.provinsi ?? null,
        providedAddress ?? resolved.address_area ?? null,
        reportId,
      )
      .run();
  } catch (e) {
    console.error(
      "[geocoding] location enrichment skipped:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
