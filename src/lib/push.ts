import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { Env } from "@/types/bindings";

export const pushConfigured = (env: Env) => ({
  web_push: {
    configured: !!(
      env.VAPID_PUBLIC_KEY &&
      env.VAPID_PRIVATE_KEY &&
      env.VAPID_SUBJECT
    ),
    public_key: env.VAPID_PUBLIC_KEY ?? null,
  },
  fcm: {
    configured: !!(
      env.FCM_PROJECT_ID &&
      env.FCM_CLIENT_EMAIL &&
      env.FCM_PRIVATE_KEY
    ),
  },
});
export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ].some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
    );
  } catch {
    return false;
  }
}
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
async function fcmAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned =
    encode({ alg: "RS256", typ: "JWT" }) +
    "." +
    encode({
      iss: env.FCM_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const pem = env
    .FCM_PRIVATE_KEY!.replace(/\\n/g, "\n")
    .replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + base64url(new Uint8Array(signature)),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("fcm_auth_" + response.status);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("fcm_auth_missing_token");
  return data.access_token;
}
export async function deliverNotificationPush(
  env: Env,
  userId: string,
  notificationId: string,
  reportId?: string,
): Promise<boolean> {
  const subscriptions = await env.D1.prepare(
    "SELECT s.*, (SELECT COUNT(*) FROM push_deliveries d WHERE d.subscription_id=s.id AND d.notification_id=? AND d.status='failed') AS failures FROM push_subscriptions s WHERE user_id=? AND NOT EXISTS (SELECT 1 FROM push_deliveries d WHERE d.subscription_id=s.id AND d.notification_id=? AND d.status='sent') AND (SELECT COUNT(*) FROM push_deliveries d WHERE d.subscription_id=s.id AND d.notification_id=? AND d.status='failed')<5 ORDER BY failures,s.id LIMIT 3",
  )
    .bind(notificationId, userId, notificationId, notificationId)
    .all<{
      id: string;
      transport: string;
      endpoint: string;
      keys_json: string;
      token: string;
    }>();
  const payload = {
    title: "SIGAP",
    body: "Ada pembaruan untuk Anda. Buka SIGAP untuk melihat detail.",
    notification_id: notificationId,
    recipient_user_id: userId,
    report_id: reportId ?? "",
  };
  let delivered = (subscriptions.results?.length ?? 0) <= 2;
  await Promise.all(
    (subscriptions.results ?? []).slice(0, 2).map(async (subscription) => {
      let status = "failed",
        errorCode: string | null = null;
      let expired = false;
      try {
        let response: Response;
        if (subscription.transport === "web") {
          if (!pushConfigured(env).web_push.configured)
            throw new Error("not_configured");
          if (!validPushEndpoint(subscription.endpoint))
            throw new Error("invalid_endpoint");
          const request = await buildPushPayload(
            { data: JSON.stringify(payload), options: { ttl: 3600 } },
            {
              endpoint: subscription.endpoint,
              expirationTime: null,
              keys: JSON.parse(subscription.keys_json),
            },
            {
              subject: env.VAPID_SUBJECT!,
              publicKey: env.VAPID_PUBLIC_KEY!,
              privateKey: env.VAPID_PRIVATE_KEY!,
            },
          );
          response = await fetch(subscription.endpoint, {
            ...request,
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          });
        } else {
          if (!pushConfigured(env).fcm.configured)
            throw new Error("not_configured");
          const accessToken = await fcmAccessToken(env);
          response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID!)}/messages:send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  token: subscription.token,
                  notification: { title: payload.title, body: payload.body },
                  data: {
                    notification_id: notificationId,
                    recipient_user_id: userId,
                    report_id: reportId ?? "",
                  },
                  android: { priority: "high" },
                },
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
        }
        status = response.ok ? "sent" : "failed";
        errorCode = response.ok ? null : "http_" + response.status;
        if (subscription.transport === "web")
          expired = response.status === 404 || response.status === 410;
        else if (!response.ok) {
          const failure = (await response.json().catch(() => null)) as {
            error?: { details?: Array<{ errorCode?: string }> };
          } | null;
          expired =
            failure?.error?.details?.some(
              (detail) => detail.errorCode === "UNREGISTERED",
            ) ?? false;
        }
        if (expired)
          await env.D1.prepare("DELETE FROM push_subscriptions WHERE id=?")
            .bind(subscription.id)
            .run();
      } catch (error) {
        errorCode =
          error instanceof Error &&
          /^(not_configured|invalid_endpoint|fcm_auth_\d+|fcm_auth_missing_token)$/.test(
            error.message,
          )
            ? error.message
            : "delivery_error";
      }
      await env.D1.prepare(
        "INSERT INTO push_deliveries(id,notification_id,subscription_id,status,error_code) VALUES(?,?,?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          notificationId,
          subscription.id,
          status,
          errorCode,
        )
        .run();
      if (status === "failed" && !expired) delivered = false;
    }),
  );
  return delivered;
}

export async function flushPendingPush(env: Env): Promise<void> {
  const jobs = await env.D1.prepare(
    "SELECT notification_id FROM push_outbox WHERE status='pending' AND datetime(next_attempt_at)<=datetime('now') AND (locked_until IS NULL OR datetime(locked_until)<datetime('now')) ORDER BY next_attempt_at LIMIT 1",
  ).all<{ notification_id: string }>();
  for (const candidate of jobs.results ?? []) {
    const job = await env.D1.prepare(
      "UPDATE push_outbox SET locked_until=datetime('now','+2 minutes'),attempts=attempts+1 WHERE notification_id=? AND status='pending' AND (locked_until IS NULL OR datetime(locked_until)<datetime('now')) RETURNING notification_id,user_id,report_id,attempts",
    )
      .bind(candidate.notification_id)
      .first<{
        notification_id: string;
        user_id: string;
        report_id: string | null;
        attempts: number;
      }>();
    if (!job) continue;
    let complete = false;
    try {
      complete = await deliverNotificationPush(
        env,
        job.user_id,
        job.notification_id,
        job.report_id ?? undefined,
      );
    } catch {
      console.error("Push outbox dispatch failed");
    }
    const exhausted = complete
      ? await env.D1.prepare(
          "SELECT COUNT(*) AS count FROM push_subscriptions s WHERE user_id=? AND NOT EXISTS (SELECT 1 FROM push_deliveries d WHERE d.subscription_id=s.id AND d.notification_id=? AND d.status='sent')",
        )
          .bind(job.user_id, job.notification_id)
          .first<{ count: number }>()
      : null;
    // attempts counts dispatch batches for observability; each recipient has its own five-failure budget.
    await env.D1.prepare(
      "UPDATE push_outbox SET status=?,locked_until=NULL,next_attempt_at=datetime('now','+5 minutes') WHERE notification_id=?",
    )
      .bind(
        complete ? (exhausted?.count ? "failed" : "sent") : "pending",
        job.notification_id,
      )
      .run();
  }
}
