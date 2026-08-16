/**
 * Deterministic coordinate generalization for privacy fuzzing.
 * Same lat/lng always produces same generalized coords (no jitter).
 * Uses grid snap to ~100m precision cells.
 */
export function generalizeLocation(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { lat: 0, lng: 0 };
  }
  return {
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
  };
}
