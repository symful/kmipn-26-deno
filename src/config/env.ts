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

function parseNumberArray(value: string | undefined, defaultValue: number[]): number[] {
  if (!value) return defaultValue;
  const parsed = value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));
  return parsed.length > 0 ? parsed : defaultValue;
}

export function getConfig(env: Record<string, string | undefined>): AppConfig {
  const config = {
    TOOL_TIMEOUT_MS: Number(env.TOOL_TIMEOUT_MS ?? 30_000),
    MAX_RETRIES: Number(env.MAX_RETRIES ?? 3),
    MAX_ITERATIONS: Number(env.MAX_ITERATIONS ?? 5),
    LOCATION_TOLERANCE_METERS: Number(env.LOCATION_TOLERANCE_METERS ?? 100),
    TIME_TOLERANCE_HOURS: Number(env.TIME_TOLERANCE_HOURS ?? 24),
    DUPLICATE_RADIUS_METERS: Number(env.DUPLICATE_RADIUS_METERS ?? 50),
    DUPLICATE_LIMIT: Number(env.DUPLICATE_LIMIT ?? 10),
    SLA_DEFAULT_DAYS: Number(env.SLA_DEFAULT_DAYS ?? 7),
    SHARE_TOKEN_EXPIRY_HOURS: Number(env.SHARE_TOKEN_EXPIRY_HOURS ?? 168),
    OUTBOX_MAX_RETRIES: Number(env.OUTBOX_MAX_RETRIES ?? 5),
    OUTBOX_RETRY_DELAYS_MINUTES: parseNumberArray(env.OUTBOX_RETRY_DELAYS_MINUTES, [1, 5, 30, 120, 720]),
    OUTBOX_BATCH_LIMIT: Number(env.OUTBOX_BATCH_LIMIT ?? 100),
    FAILED_ASSESSMENTS_BATCH_LIMIT: Number(env.FAILED_ASSESSMENTS_BATCH_LIMIT ?? 50),
    DEFAULT_PAGE_SIZE: Number(env.DEFAULT_PAGE_SIZE ?? 20),
    MAX_PAGE_SIZE: Number(env.MAX_PAGE_SIZE ?? 100),
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
