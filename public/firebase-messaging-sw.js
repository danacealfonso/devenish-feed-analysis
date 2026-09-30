/* Push notifications for Feed Analysis.
 *
 * Firebase Cloud Messaging delivers data-only messages ({ title, body, url, tag }) here.
 * If the portal is open and visible, the message goes to the page, which shows it as a toast.
 * Otherwise it is shown as a system notification; clicking it opens (or focuses) the portal at the link.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { title: "Feed Analysis", body: event.data ? event.data.text() : "" } };
  }
  const d = payload.data || payload.notification || payload;
  const msg = {
    title: d.title || "Feed Analysis",
    body: d.body || "",
    url: d.url || (payload.fcmOptions && payload.fcmOptions.link) || "/",
    tag: d.tag || undefined,
  };

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const visible = wins.filter((w) => w.visibilityState === "visible");
      if (visible.length) {
        for (const w of visible) w.postMessage({ type: "feed-push", msg });
        return;
      }
      return self.registration.showNotification(msg.title, {
        body: msg.body,
        tag: msg.tag,
        renotify: !!msg.tag,
        icon: "/icon-192.png",
        badge: "/badge-72.png",
        data: { url: msg.url },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (same) return same.focus().then((w) => (w || same).navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
