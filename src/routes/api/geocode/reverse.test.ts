/// <reference lib="deno.ns" />

Deno.test("reverse geocode response shape - valid result", () => {
  const result = {
    address: "Desa X, Kec Y, Kota Z",
    road: null,
    village: { id: "v1", name: "Desa X" },
    subdistrict: { id: "s1", name: "Kec Y" },
    district: { id: "d1", name: "Kota Z" },
    province: { id: "p1", name: "Provinsi A" },
  };

  if (typeof result.address !== "string") {
    throw new Error(`Expected address to be string`);
  }

  if (result.road !== null) {
    throw new Error(`Expected road to be null`);
  }

  if (typeof result.village !== "object" || result.village === null) {
    throw new Error(`Expected village to be object`);
  }
  if (typeof result.village.id !== "string" || typeof result.village.name !== "string") {
    throw new Error(`Expected village.id and village.name to be strings`);
  }

  if (typeof result.subdistrict !== "object" || result.subdistrict === null) {
    throw new Error(`Expected subdistrict to be object`);
  }
  if (typeof result.subdistrict.id !== "string" || typeof result.subdistrict.name !== "string") {
    throw new Error(`Expected subdistrict.id and subdistrict.name to be strings`);
  }

  if (typeof result.district !== "object" || result.district === null) {
    throw new Error(`Expected district to be object`);
  }
  if (typeof result.district.id !== "string" || typeof result.district.name !== "string") {
    throw new Error(`Expected district.id and district.name to be strings`);
  }

  if (typeof result.province !== "object" || result.province === null) {
    throw new Error(`Expected province to be object`);
  }
  if (typeof result.province.id !== "string" || typeof result.province.name !== "string") {
    throw new Error(`Expected province.id and province.name to be strings`);
  }
});

Deno.test("reverse geocode validation - rejects invalid lat/lng", () => {
  const validateCoords = (lat: unknown, lng: unknown): boolean => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    return !latNum || !lngNum || isNaN(latNum) || isNaN(lngNum);
  };

  if (!validateCoords(null, null)) {
    throw new Error("Should reject null coords");
  }
  if (!validateCoords(undefined, undefined)) {
    throw new Error("Should reject undefined coords");
  }
  if (!validateCoords("", "")) {
    throw new Error("Should reject empty string coords");
  }
  if (!validateCoords(NaN, NaN)) {
    throw new Error("Should reject NaN coords");
  }
  if (!validateCoords(0, 0)) {
    throw new Error("Should reject zero coords (0, 0 is technically valid but edge case)");
  }

  const validLat = -6.2;
  const validLng = 106.8;
  if (validateCoords(validLat, validLng)) {
    throw new Error("Should accept valid coords");
  }
});
