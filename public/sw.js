self.addEventListener("push", function (event) {
  if (!event.data) return;
  let data = { title: "DCMS", body: "", url: "/dashboard" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    data.body = event.data.text();
  }
  const options = {
    body: data.body || "New notification",
    icon: "/icon-192.png",
    badge: "/icon-72.png",
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(data.title || "DCMS", options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
