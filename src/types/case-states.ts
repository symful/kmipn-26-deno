/**
 * Shared case state constants used across the application.
 * These constants define which states are terminal, appealable, or reopenable.
 */

/** States that represent a terminal (final) state for a report. */
export const TERMINAL_STATES = [
  "rejected",
  "duplicate_merged",
  "closed",
] as const;

/** States that allow a warga to file an objection (sanggahan). */
export const APPEALABLE_STATES = ["rejected", "needs_completion"] as const;

/** States that allow a warga to request a reopen. */
export const REOPENABLE_STATES = ["closed", "resolved"] as const;

/**
 * States from which the reporter may self-close.
 * Terminal states (rejected, duplicate_merged, closed) and
 * pre-verification states (draft, submitted, under_review, pending) are excluded.
 */
export const SELF_CLOSABLE_STATES = [
  "verified",
  "assigned",
  "in_progress",
  "needs_survey",
  "needs_completion",
] as const;
