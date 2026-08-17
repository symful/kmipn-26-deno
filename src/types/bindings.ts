/// <reference types="@cloudflare/workers-types" />

export interface Env {
  POSTGRESQL_URI: string;
  LLM_API_URI: string;
  LLM_API_KEY: string;
  JWT_SECRET: string;
  HYPERDRIVE: Hyperdrive;
  R2: R2Bucket;
  D1: D1Database;
  RATE_LIMITER?: KVNamespace;
  ASSETS: Fetcher;
  PGPASSWORD: string;
  HOME: string;
  /** Public URL prefix for R2 photo reads, e.g. https://media.sigap.live */
  R2_PUBLIC_URL?: string;
  /** R2 bucket name for S3-compatible API */
  R2_BUCKET_NAME?: string;
  /** R2 S3-compatible API access key ID */
  R2_ACCESS_KEY_ID?: string;
  /** R2 S3-compatible API secret access key */
  R2_SECRET_ACCESS_KEY?: string;
  /** R2 account ID for S3-compatible endpoint */
  R2_ACCOUNT_ID?: string;
  /** JSON map of target_system -> delivery URL, e.g. {"satu_data":"https://..."} */
  OUTBOUND_TARGETS?: string;
  /** Set to "true" to skip audit append on login/refresh/logout */
  DISABLE_LOGIN_AUDIT?: string;
  /** Application base URL for share links */
  APP_BASE_URL?: string;
  /** Reporting domain (used as fallback) */
  CF_REPORTING_DOMAIN?: string;
  /** Set to "production" to strip stack traces from client error responses */
  ENVIRONMENT?: string;
  /** Set to "true" along with ENVIRONMENT="development" to bypass rate limiting */
  RATE_LIMIT_BYPASS?: string;
  /** Text model name, defaults to MiniMax-M2.1 */
  TEXT_MODEL_NAME?: string;
  /** Vision model name, defaults to MiniMax-M3 */
  VISION_MODEL_NAME?: string;
  /** Secret for verifying inbound webhook HMAC signatures */
  WEBHOOK_SECRET?: string;
  /** SIPD API endpoint URL */
  SIPD_ENDPOINT_URL?: string;
  /** HMAC secret for signing outbound SIPD payloads */
  SIPD_HMAC_SECRET?: string;
  /** Satu Data API endpoint URL */
  SATU_DATA_ENDPOINT_URL?: string;
  /** Bearer token for Satu Data API */
  SATU_DATA_TOKEN?: string;
  /** HMAC secret for signing outbound payloads */
  OUTBOUND_HMAC_SECRET?: string;
  /** Header name for outbound HMAC signature */
  OUTBOUND_HMAC_HEADER?: string;
  /** Comma-separated list of allowed CORS origins */
  ALLOWED_ORIGINS?: string;
  /** Max retry attempts for failed assessments */
  RETRY_MAX_ATTEMPTS?: string;
  /** Batch limit for failed assessments retry */
  RETRY_BATCH_LIMIT?: string;
}

declare global {
  interface CloudflareHyperdrive {
    connectionString: string;
  }
}

export {};
