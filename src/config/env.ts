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
  // Default severity
  DEFAULT_SEVERITY: number;
  // Share
  SHARE_TOKEN_EXPIRY_HOURS: number;
  // Failed assessments cron
  FAILED_ASSESSMENTS_BATCH_LIMIT: number;
  // Pagination
  DEFAULT_PAGE_SIZE: number;
  MAX_PAGE_SIZE: number;
  // App URL
  APP_BASE_URL?: string;
  // Image hosts
  ALLOWED_IMAGE_HOSTS?: string;
  // JWT
  JWT_SECRET: string;
  // LLM models
  TEXT_MODEL_NAME: string;
  VISION_MODEL_NAME: string;
}

export function getConfig(env: Record<string, string | undefined>): AppConfig {
  const config = {
    TOOL_TIMEOUT_MS: Number(
      env.TOOL_TIMEOUT_MS ??
        (() => {
          throw new Error("TOOL_TIMEOUT_MS is required");
        })(),
    ),
    MAX_RETRIES: Number(
      env.MAX_RETRIES ??
        (() => {
          throw new Error("MAX_RETRIES is required");
        })(),
    ),
    MAX_ITERATIONS: Number(
      env.MAX_ITERATIONS ??
        (() => {
          throw new Error("MAX_ITERATIONS is required");
        })(),
    ),
    LOCATION_TOLERANCE_METERS: Number(
      env.LOCATION_TOLERANCE_METERS ??
        (() => {
          throw new Error("LOCATION_TOLERANCE_METERS is required");
        })(),
    ),
    TIME_TOLERANCE_HOURS: Number(
      env.TIME_TOLERANCE_HOURS ??
        (() => {
          throw new Error("TIME_TOLERANCE_HOURS is required");
        })(),
    ),
    DUPLICATE_RADIUS_METERS: Number(
      env.DUPLICATE_RADIUS_METERS ??
        (() => {
          throw new Error("DUPLICATE_RADIUS_METERS is required");
        })(),
    ),
    DUPLICATE_LIMIT: Number(
      env.DUPLICATE_LIMIT ??
        (() => {
          throw new Error("DUPLICATE_LIMIT is required");
        })(),
    ),
    SLA_DEFAULT_DAYS: Number(
      env.SLA_DEFAULT_DAYS ??
        (() => {
          throw new Error("SLA_DEFAULT_DAYS is required");
        })(),
    ),
    DEFAULT_SEVERITY: Number(env.DEFAULT_SEVERITY ?? 33),
    SHARE_TOKEN_EXPIRY_HOURS: Number(
      env.SHARE_TOKEN_EXPIRY_HOURS ??
        (() => {
          throw new Error("SHARE_TOKEN_EXPIRY_HOURS is required");
        })(),
    ),
    FAILED_ASSESSMENTS_BATCH_LIMIT: Number(
      env.FAILED_ASSESSMENTS_BATCH_LIMIT ??
        (() => {
          throw new Error("FAILED_ASSESSMENTS_BATCH_LIMIT is required");
        })(),
    ),
    DEFAULT_PAGE_SIZE: Number(
      env.DEFAULT_PAGE_SIZE ??
        (() => {
          throw new Error("DEFAULT_PAGE_SIZE is required");
        })(),
    ),
    MAX_PAGE_SIZE: Number(
      env.MAX_PAGE_SIZE ??
        (() => {
          throw new Error("MAX_PAGE_SIZE is required");
        })(),
    ),
    JWT_SECRET: "",
    ALLOWED_IMAGE_HOSTS: env.ALLOWED_IMAGE_HOSTS,
  } as AppConfig;

  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required and must not be empty");
  }
  config.JWT_SECRET = env.JWT_SECRET;
  if (!env.TEXT_MODEL_NAME) {
    throw new Error("TEXT_MODEL_NAME is required and must not be empty");
  }
  config.TEXT_MODEL_NAME =
    env.TEXT_MODEL_NAME === "free" && env.LLM_API_URI?.includes("openrouter.ai")
      ? "openrouter/free"
      : env.TEXT_MODEL_NAME;
  if (!env.VISION_MODEL_NAME) {
    throw new Error("VISION_MODEL_NAME is required and must not be empty");
  }
  config.VISION_MODEL_NAME =
    env.VISION_MODEL_NAME === "free" &&
    env.LLM_API_URI?.includes("openrouter.ai")
      ? "openrouter/free"
      : env.VISION_MODEL_NAME;
  if (env.APP_BASE_URL !== undefined) {
    config.APP_BASE_URL = env.APP_BASE_URL;
  }
  return config;
}
