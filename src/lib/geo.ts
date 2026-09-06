/**
 * Truncates coordinates to 3 decimal places (~111 m) for public-facing privacy.
 * Returns null for invalid inputs (NaN, zero, out-of-range).
 */
export function generalizeLocation(
  lat: number,
  lng: number,
): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const factor = 1000; // 3 decimal places ≈ 111 m
  return {
    lat: Math.trunc(lat * factor) / factor,
    lng: Math.trunc(lng * factor) / factor,
  };
}
