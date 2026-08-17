/**
 * Shared case state constants used across the application.
 * These constants define which states are terminal, appealable, or reopenable.
 */

/** States that represent a terminal (final) state for a report. */
export const TERMINAL_STATES = ["rejected", "duplicate_merged", "closed"] as const;

/** States that allow a warga to file an objection (sanggahan). */
export const APPEALABLE_STATES = ["rejected", "needs_completion"] as const;

/** States that allow a warga to request a reopen. */
export const REOPENABLE_STATES = ["closed", "resolved"] as const;
