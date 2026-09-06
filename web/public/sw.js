self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    /* Use generic copy for malformed payloads. */
  }
  const reportId =
    typeof payload.report_id === "string" ? payload.report_id : null;
  event.waitUntil(
    (async () => {
      const owner = await (
        await caches.open("sigap-push-context")
      ).match("/__sigap_push_owner");
      const userId = owner ? await owner.text() : null;
      if (
        !userId ||
        (typeof payload.recipient_user_id === "string" &&
          payload.recipient_user_id !== userId)
      )
        return;
      await Promise.all([
        self.registration.showNotification(
          typeof payload.title === "string" ? payload.title : "SIGAP",
          {
            body:
              typeof payload.body === "string"
                ? payload.body
                : "Ada pembaruan laporan. Buka SIGAP untuk melihatnya.",
            icon: "/sigap-icon.png",
            badge: "/favicon-32.png",
            tag:
              typeof payload.notification_id === "string"
                ? payload.notification_id
                : undefined,
            data: {
              url: reportId
                ? "/system/cases/" + encodeURIComponent(reportId)
                : "/system/notifications",
            },
          },
        ),
        self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then((clients) =>
            clients.forEach((client) =>
              client.postMessage({ type: "SIGAP_NOTIFICATION" }),
            ),
          ),
      ]);
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidate = new URL(
    event.notification.data?.url ?? "/system/notifications",
    self.location.origin,
  );
  const url =
    candidate.origin === self.location.origin &&
    candidate.pathname.startsWith("/system/")
      ? candidate.href
      : self.location.origin + "/system/notifications";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const client = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (client) {
          await client.navigate(url);
          return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
