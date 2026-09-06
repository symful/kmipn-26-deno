export interface PushConfiguration {
  web_push: { configured: boolean; public_key: string | null };
  fcm: { configured: boolean };
}
export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
