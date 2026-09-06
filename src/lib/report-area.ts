export function recordedAddress(report: {
  address_area?: string | undefined;
  kelurahan?: string | undefined;
  kecamatan?: string | undefined;
  kabupaten?: string | undefined;
  provinsi?: string | undefined;
}): string | null {
  return (
    report.address_area?.trim() ||
    [
      ...new Set(
        [report.kelurahan, report.kecamatan, report.kabupaten, report.provinsi]
          .map((value) => value?.trim())
          .filter(Boolean),
      ),
    ].join(", ") ||
    null
  );
}

// Uses recorded place names only; no reverse-geocoding or placeholder locations.
export const REPORT_AREA_SQL = `COALESCE(NULLIF(TRIM(r.address_area), ''), NULLIF(RTRIM(
  CASE WHEN NULLIF(TRIM(r.kelurahan), '') IS NOT NULL THEN TRIM(r.kelurahan) || ', ' ELSE '' END ||
  CASE WHEN NULLIF(TRIM(r.kecamatan), '') IS NOT NULL THEN TRIM(r.kecamatan) || ', ' ELSE '' END ||
  CASE WHEN NULLIF(TRIM(r.kabupaten), '') IS NOT NULL THEN TRIM(r.kabupaten) || ', ' ELSE '' END ||
  CASE WHEN NULLIF(TRIM(r.provinsi), '') IS NOT NULL THEN TRIM(r.provinsi) ELSE '' END,
  ', '), ''))`;
