import { api } from "../api/client";
export const supportsBrowserPush = () =>
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
export async function pushRegistration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
export async function disableBrowserPush() {
  if (!("serviceWorker" in navigator)) return;
  await (await caches.open("sigap-push-context")).delete("/__sigap_push_owner");
  const registration = await navigator.serviceWorker.getRegistration("/");
  for (const notification of (await registration?.getNotifications()) ?? [])
    notification.close();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    try {
      await api.unsubscribePush(subscription.endpoint);
    } finally {
      await subscription.unsubscribe();
      localStorage.removeItem("sigap-push-user");
    }
  }
}
export async function enableBrowserPush(publicKey: string, userId: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Izin notifikasi belum diberikan. Ubah izin situs di pengaturan browser untuk mengaktifkannya.",
    );
  await pushRegistration();
  const registration = await navigator.serviceWorker.ready;
  const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  const value = subscription.toJSON();
  if (!value.keys?.p256dh || !value.keys?.auth)
    throw new Error("Browser tidak menyediakan kunci langganan notifikasi.");
  try {
    await api.subscribePush({
      endpoint: subscription.endpoint,
      keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    });
  } catch (error) {
    if (!existing) await subscription.unsubscribe();
    throw error;
  }
  localStorage.setItem("sigap-push-user", userId);
  await (
    await caches.open("sigap-push-context")
  ).put("/__sigap_push_owner", new Response(userId));
}
