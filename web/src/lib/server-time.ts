/** SQLite server timestamps without an offset represent UTC, not browser local time.
 * Date-only values and explicitly zoned timestamps retain their existing semantics.
 */
export function parseServerTimestamp(value: string): Date {
  const normalized = value.trim();
  const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    normalized,
  )
    ? normalized.replace(" ", "T") + "Z"
    : normalized;
  return new Date(utc);
}
