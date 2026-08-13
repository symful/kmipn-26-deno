export const RETENTION = {
  reports: 730,
  audit_log: 1825,
  media: 730,
} as const;

export function isExpired(createdAt: Date, retentionDays: number): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs > retentionDays * 24 * 60 * 60 * 1000;
}
