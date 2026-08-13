// PII redaction regexes (applied to text fields before export)
export const PHONE_RE = /(\+62|08)[\d\s\-()]{6,15}/g;
export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const NIK_RE = /\b\d{16}\b/g;

export function redactPII(text: string): string {
  return text
    .replace(PHONE_RE, "[PHONE]")
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(NIK_RE, "[NIK]");
}

export function redactRow(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    if (typeof out[f] === "string") {
      out[f] = redactPII(out[f] as string);
    }
  }
  return out;
}
