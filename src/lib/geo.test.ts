/// <reference lib="deno.ns" />

import { generalizeLocation } from "./geo.ts";

Deno.test("generalizeLocation is deterministic", () => {
  const inputs = [
    { lat: -6.123456, lng: 106.654321 },
    { lat: -7.500000, lng: 110.000000 },
    { lat: 1.111111, lng: 120.999999 },
  ];
  for (const input of inputs) {
    const r1 = generalizeLocation(input.lat, input.lng);
    const r2 = generalizeLocation(input.lat, input.lng);
    const r3 = generalizeLocation(input.lat, input.lng);
    if (r1.lat !== r2.lat || r1.lng !== r2.lng) {
      throw new Error(`Second call should match first for (${input.lat}, ${input.lng}): got ${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
    }
    if (r2.lat !== r3.lat || r2.lng !== r3.lng) {
      throw new Error(`Third call should match first for (${input.lat}, ${input.lng}): got ${JSON.stringify(r2)} vs ${JSON.stringify(r3)}`);
    }
  }
});

Deno.test("generalizeLocation rounds to 3 decimal places", () => {
  const result = generalizeLocation(-6.123456789, 106.987654321);
  if (result.lat !== -6.123) {
    throw new Error(`Expected lat -6.123, got ${result.lat}`);
  }
  if (result.lng !== 106.988) {
    throw new Error(`Expected lng 106.988, got ${result.lng}`);
  }
});
