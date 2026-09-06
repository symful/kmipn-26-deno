/**
 * Canonical error code union for the SIGAP API.
 * All route-level error responses must use one of these codes.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_CREDENTIALS",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "INVALID_STATUS",
  "MISSING_TASK_ID",
  "MISSING_ID",
  "OUTSIDE_SERVICE_AREA",
  "INSERT_FAILED",
  "UNAUTHORIZED",
  "INTERNAL_ERROR",
  "TOKEN_ERROR",
  "DB_ERROR",
  "RATE_LIMITED",
  "UNSUPPORTED_MEDIA",
  "DUPLICATE",
  "EMAIL_ALREADY_EXISTS",
  "FORBIDDEN",
  "CONFLICT",
  "REPORT_NOT_FOUND",
  "TOKEN_VERIFY_FAILED",
  "CATEGORY_NOT_FOUND",
  "INVALID_REPORT_OR_USER",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Build a structured error response body.
 *
 * @param code    - One of the canonical ErrorCode values.
 * @param message - Human-readable message safe to return to the client.
 * @param extras  - Optional additional fields merged into the error object
 *                  (e.g. { details } for Zod validation errors).
 */
export function err(
  code: ErrorCode,
  message: string,
  extras?: Record<string, unknown>,
): { error: { code: ErrorCode; message: string } & Record<string, unknown> } {
  return { error: { code, message, ...extras } };
}
