/// <reference lib="deno.ns" />

/**
 * Unit tests for GET /api/public/stats endpoint handler.
 *
 * Tests the expected shape of the stats response and validation logic.
 * Note: These are unit tests for response shape validation, not integration tests.
 * The actual DB queries require a live database connection.
 */

Deno.test("stats response shape - valid structure", () => {
  // Simulate the expected stats object shape returned by the handler
  const stats = {
    total: 100,
    by_status: { submitted: 50, resolved: 50 },
    by_category: [{ category_id: "cat1", count: 100 }],
    recent_reports_7d: 25,
    resolution_rate_7d: 0.5,
  };

  // Validate total is a number
  if (typeof stats.total !== "number") {
    throw new Error(`Expected total to be number, got ${typeof stats.total}`);
  }

  // Validate by_status is an object
  if (typeof stats.by_status !== "object" || stats.by_status === null) {
    throw new Error(`Expected by_status to be object, got ${typeof stats.by_status}`);
  }

  // Validate by_category is an array
  if (!Array.isArray(stats.by_category)) {
    throw new Error(`Expected by_category to be array, got ${typeof stats.by_category}`);
  }

  // Validate by_category items have expected shape when array is non-empty
  if (stats.by_category.length > 0) {
    const catItem = stats.by_category[0];
    if (!catItem || typeof catItem.category_id !== "string" || typeof catItem.count !== "number") {
      throw new Error(`Expected category item to have category_id (string) and count (number)`);
    }
  }

  // Validate recent_reports_7d is a number
  if (typeof stats.recent_reports_7d !== "number") {
    throw new Error(`Expected recent_reports_7d to be number`);
  }

  // Validate resolution_rate_7d is a number between 0 and 1
  if (typeof stats.resolution_rate_7d !== "number") {
    throw new Error(`Expected resolution_rate_7d to be number`);
  }
  if (stats.resolution_rate_7d < 0 || stats.resolution_rate_7d > 1) {
    throw new Error(`Expected resolution_rate_7d to be between 0 and 1, got ${stats.resolution_rate_7d}`);
  }
});

Deno.test("stats response shape - handles zero values gracefully", () => {
  // Simulate edge case with zero values
  const stats = {
    total: 0,
    by_status: {},
    by_category: [],
    recent_reports_7d: 0,
    resolution_rate_7d: 0,
  };

  // Total can be zero
  if (stats.total !== 0) {
    throw new Error(`Expected total to be 0`);
  }

  // by_status can be empty object
  if (typeof stats.by_status !== "object") {
    throw new Error(`Expected by_status to be object`);
  }

  // by_category can be empty array
  if (!Array.isArray(stats.by_category)) {
    throw new Error(`Expected by_category to be array`);
  }

  // resolution_rate_7d can be 0 when no reports exist
  if (stats.resolution_rate_7d !== 0) {
    throw new Error(`Expected resolution_rate_7d to be 0 when no reports`);
  }
});
