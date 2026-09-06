/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** Approved Photon-compatible reverse-geocoding service; absent disables external lookups. */
  GEOCODING_API_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  FCM_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
  LLM_API_URI: string;
  LLM_API_KEY: string;
  JWT_SECRET: string;
  PHOTO_EVIDENCE_SECRET?: string;
  R2: R2Bucket;
  D1: D1Database;
  RATE_LIMITER?: KVNamespace;
  ASSETS: Fetcher;
  /** Public URL prefix for R2 photo reads, e.g. https://r2.sigap.live */
  R2_PUBLIC_URL?: string;
  /** Set to "true" to skip audit append on login/refresh/logout */
  DISABLE_LOGIN_AUDIT?: string;
  /** Application base URL for share links */
  APP_BASE_URL?: string;
  /** Set to "production" to strip stack traces from client error responses */
  ENVIRONMENT?: string;
  /** Set to "true" along with ENVIRONMENT="development" to bypass rate limiting */
  RATE_LIMIT_BYPASS?: string;
  /** Required: text model used for classification/completeness tools */
  TEXT_MODEL_NAME?: string;
  /** Required: vision model used for media/damage tools */
  VISION_MODEL_NAME?: string;
  /** Comma-separated list of allowed CORS origins */
  ALLOWED_ORIGINS?: string;
  /** Secret for Turnstile captcha verification */
  CAPTCHA_SECRET?: string;
}

export type { Role } from "@/lib/types";
