/**
 * RBAC helpers for wilayah_id scoping.
 *
 * All routes that list/report data MUST call applyWilayahFilter before query
 * execution to ensure users only see data from their own wilayah.
 * Users with wilayah_id = null (admin_global) see all data.
 */

interface ApplyWilayahFilterResult {
  sql: string;
  params: unknown[];
}

/**
 * Injects a WHERE / AND clause for `tableName.wilayah_id = $N` into a SQL query.
 *
 * Strategy:
 * - Injects BEFORE "ORDER BY", "LIMIT", or "OFFSET" (which are the last clauses
 *   in all report-listing queries in this codebase).
 * - If the query has no WHERE, inserts `WHERE <cond>` before the anchor.
 * - If the query already has a WHERE, appends `AND <cond>` before the anchor.
 * - All values use positional parameter placeholders ($N) — never string concat.
 *
 * @param sqlQuery     Raw SQL with optional WHERE/LIMIT/OFFSET
 * @param params       Existing query params array
 * @param userWilayahId  The user's wilayah_id from JWT (null = admin_global)
 * @param tableName    Table/alias to qualify (default "reports")
 */
export function applyWilayahFilter(
  sqlQuery: string,
  params: unknown[],
  userWilayahId: string | null | undefined,
  tableName = "reports",
): ApplyWilayahFilterResult {
  if (userWilayahId == null) {
    return { sql: sqlQuery, params };
  }

  const paramIndex = params.length + 1; // next positional placeholder
  const condition = `${tableName}.wilayah_id = $${paramIndex}`;

  // Anchor list: stop before ORDER BY / LIMIT / OFFSET / GROUP BY / HAVING
  const anchorMatch = /\b(ORDER\s+BY|LIMIT|OFFSET|GROUP\s+BY|HAVING)\b/i.exec(sqlQuery);

  if (!anchorMatch) {
    // No anchor — append to end (safe for simple queries)
    return {
      sql: `${sqlQuery} WHERE ${condition}`,
      params: [...params, userWilayahId],
    };
  }

  const anchorPos = anchorMatch.index;
  const beforeAnchor = sqlQuery.slice(0, anchorPos).trimEnd();
  const afterAnchor = sqlQuery.slice(anchorPos);

  // Detect whether there's already a WHERE clause before the anchor
  const hasWhere = /\bWHERE\b/i.test(beforeAnchor);

  if (!hasWhere) {
    return {
      sql: `${beforeAnchor} WHERE ${condition} ${afterAnchor}`,
      params: [...params, userWilayahId],
    };
  }

  // WHERE exists — append AND
  return {
    sql: `${beforeAnchor} AND ${condition} ${afterAnchor}`,
    params: [...params, userWilayahId],
  };
}
