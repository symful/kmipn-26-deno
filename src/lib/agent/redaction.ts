/**
 * PII Redaction Utilities
 * Removes personally identifiable information before public projection
 * Contract line 167: "Redaksi pribadi dilakukan sebelum media atau teks masuk ke proyeksi publik"
 */

// NIK (Nomor Induk Kependudukan) - Indonesian national ID: 16 digits
const NIK_PATTERN = /\b\d{16}\b/g;

// Indonesian phone patterns: 08xx, +62, 62-x
const PHONE_PATTERN = /(?:\+62|62|0)[2-9]\d{7,11}/g;

// Email pattern
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common Indonesian name patterns (capitalized words, typically 2-4 words)
// eslint-disable-next-line no-control-regex
const NAME_PATTERN = /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,3}\b/g;

/**
 * Redact PII from text by replacing with [REDACTED] placeholders
 */
function replacePII(text: string): string {
  let redacted = text;

  // Redact NIK (16 digit IDs)
  redacted = redacted.replace(NIK_PATTERN, "[NIK_REDACTED]");

  // Redact phone numbers
  redacted = redacted.replace(PHONE_PATTERN, "[PHONE_REDACTED]");

  // Redact emails
  redacted = redacted.replace(EMAIL_PATTERN, "[EMAIL_REDACTED]");

  // Redact potential names (words that look like personal names)
  // Only redacts names that appear to be standalone (not in other contexts)
  redacted = redacted.replace(NAME_PATTERN, (match) => {
    // Skip if it looks like a place, organization, or common word
    const skipWords = ["desa", "kecamatan", "kabupaten", "kota", "provinsi", "indonesia",
                      "jalan", "rt", "rw", "nomor", "tanggal", "bulan", "tahun"];
    const lower = match.toLowerCase();
    if (skipWords.some(w => lower.includes(w))) {
      return match;
    }
    return "[NAME_REDACTED]";
  });

  return redacted;
}

/**
 * Redact text by removing PII patterns
 * @param text - Input text that may contain PII
 * @returns Redacted text safe for public projection
 */
export function redactText(text: string): string {
  if (!text || typeof text !== "string") {
    return text ?? "";
  }
  return replacePII(text);
}

/**
 * Redact PII from an object by recursively processing string fields
 * @param obj - Object containing text fields
 * @param fields - Field names to redact (default: ["description", "name"])
 * @returns Object with redacted fields
 */
export function redactObject<T extends object>(obj: T, fields: string[] = ["description", "name"]): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (fields.includes(key) && typeof value === "string") {
      result[key] = redactText(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactObject(value as object, fields);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
