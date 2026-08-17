export interface AppConfig {
  // Timeouts & Retries
  TOOL_TIMEOUT_MS: number;
  MAX_RETRIES: number;
  MAX_ITERATIONS: number;
  // Location/Time tolerances
  LOCATION_TOLERANCE_METERS: number;
  TIME_TOLERANCE_HOURS: number;
  // Duplicate detection
  DUPLICATE_RADIUS_METERS: number;
  DUPLICATE_LIMIT: number;
  // SLA
  SLA_DEFAULT_DAYS: number;
  // Share
  SHARE_TOKEN_EXPIRY_HOURS: number;
  // Outbox
  OUTBOX_MAX_RETRIES: number;
  OUTBOX_RETRY_DELAYS_MINUTES: number[];
  OUTBOX_BATCH_LIMIT: number;
  // Failed assessments cron
  FAILED_ASSESSMENTS_BATCH_LIMIT: number;
  // Pagination
  DEFAULT_PAGE_SIZE: number;
  MAX_PAGE_SIZE: number;
  // App URL
  APP_BASE_URL?: string;
  CF_REPORTING_DOMAIN?: string;
  // Image hosts
  ALLOWED_IMAGE_HOSTS?: string;
  // JWT
  JWT_SECRET: string;
}

function parseNumberArray(value: string | undefined): number[] {
  if (!value) throw new Error("OUTBOX_RETRY_DELAYS_MINUTES is required");
  const parsed = value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));
  if (parsed.length === 0) throw new Error("OUTBOX_RETRY_DELAYS_MINUTES must contain at least one valid number");
  return parsed;
}

export function getConfig(env: Record<string, string | undefined>): AppConfig {
  const config = {
    TOOL_TIMEOUT_MS: Number(env.TOOL_TIMEOUT_MS ?? (() => { throw new Error("TOOL_TIMEOUT_MS is required") })()),
    MAX_RETRIES: Number(env.MAX_RETRIES ?? (() => { throw new Error("MAX_RETRIES is required") })()),
    MAX_ITERATIONS: Number(env.MAX_ITERATIONS ?? (() => { throw new Error("MAX_ITERATIONS is required") })()),
    LOCATION_TOLERANCE_METERS: Number(env.LOCATION_TOLERANCE_METERS ?? (() => { throw new Error("LOCATION_TOLERANCE_METERS is required") })()),
    TIME_TOLERANCE_HOURS: Number(env.TIME_TOLERANCE_HOURS ?? (() => { throw new Error("TIME_TOLERANCE_HOURS is required") })()),
    DUPLICATE_RADIUS_METERS: Number(env.DUPLICATE_RADIUS_METERS ?? (() => { throw new Error("DUPLICATE_RADIUS_METERS is required") })()),
    DUPLICATE_LIMIT: Number(env.DUPLICATE_LIMIT ?? (() => { throw new Error("DUPLICATE_LIMIT is required") })()),
    SLA_DEFAULT_DAYS: Number(env.SLA_DEFAULT_DAYS ?? (() => { throw new Error("SLA_DEFAULT_DAYS is required") })()),
    SHARE_TOKEN_EXPIRY_HOURS: Number(env.SHARE_TOKEN_EXPIRY_HOURS ?? (() => { throw new Error("SHARE_TOKEN_EXPIRY_HOURS is required") })()),
    OUTBOX_MAX_RETRIES: Number(env.OUTBOX_MAX_RETRIES ?? (() => { throw new Error("OUTBOX_MAX_RETRIES is required") })()),
    OUTBOX_RETRY_DELAYS_MINUTES: parseNumberArray(env.OUTBOX_RETRY_DELAYS_MINUTES),
    OUTBOX_BATCH_LIMIT: Number(env.OUTBOX_BATCH_LIMIT ?? (() => { throw new Error("OUTBOX_BATCH_LIMIT is required") })()),
    FAILED_ASSESSMENTS_BATCH_LIMIT: Number(env.FAILED_ASSESSMENTS_BATCH_LIMIT ?? (() => { throw new Error("FAILED_ASSESSMENTS_BATCH_LIMIT is required") })()),
    DEFAULT_PAGE_SIZE: Number(env.DEFAULT_PAGE_SIZE ?? (() => { throw new Error("DEFAULT_PAGE_SIZE is required") })()),
    MAX_PAGE_SIZE: Number(env.MAX_PAGE_SIZE ?? (() => { throw new Error("MAX_PAGE_SIZE is required") })()),
    JWT_SECRET: "",
    ALLOWED_IMAGE_HOSTS: env.ALLOWED_IMAGE_HOSTS,
  } as AppConfig;

  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required and must not be empty");
  }
  config.JWT_SECRET = env.JWT_SECRET;
  if (env.APP_BASE_URL !== undefined) {
    config.APP_BASE_URL = env.APP_BASE_URL;
  }
  if (env.CF_REPORTING_DOMAIN !== undefined) {
    config.CF_REPORTING_DOMAIN = env.CF_REPORTING_DOMAIN;
  }
  return config;
}
