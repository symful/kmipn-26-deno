/**
 * Normalize photo_urls field from D1 database.
 * D1 stores photo_urls as a JSON string (e.g., '["url1","url2"]').
 * This function ensures the result is always an array.
 */
export function normalizePhotoUrls(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

/**
 * Normalize photo_urls on an object with optional photo_urls field.
 * Only affects the photo_urls property, leaves other properties unchanged.
 */
export function normalizeReportPhotoUrls<T extends { photo_urls?: unknown }>(
  obj: T,
): T {
  if (obj.photo_urls !== undefined) {
    obj.photo_urls = normalizePhotoUrls(obj.photo_urls);
  }
  return obj;
}

/**
 * Normalize photo_urls on an array of objects with optional photo_urls field.
 */
export function normalizeReportsPhotoUrls<T extends { photo_urls?: unknown }>(
  arr: T[],
): T[] {
  return arr.map((item) => normalizeReportPhotoUrls(item));
}

export function normalizeTaskEvidenceUrls<
  T extends {
    completion_evidence_urls?: unknown;
    resolution_evidence_urls?: unknown;
  },
>(obj: T): T {
  if (obj.completion_evidence_urls !== undefined) {
    obj.completion_evidence_urls = normalizePhotoUrls(
      obj.completion_evidence_urls,
    );
  }
  if (obj.resolution_evidence_urls !== undefined) {
    obj.resolution_evidence_urls = normalizePhotoUrls(
      obj.resolution_evidence_urls,
    );
  }
  return obj;
}

export function normalizeTasksEvidenceUrls<
  T extends {
    completion_evidence_urls?: unknown;
    resolution_evidence_urls?: unknown;
  },
>(arr: T[]): T[] {
  return arr.map((item) => normalizeTaskEvidenceUrls(item));
}
