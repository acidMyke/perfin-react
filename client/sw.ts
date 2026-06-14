/// <reference lib="WebWorker" />

import { NotificationEventDataSchema } from '#server/lib/notification';

declare const self: ServiceWorkerGlobalScope;
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const { title = 'Perfin', ...otherOptions } = NotificationEventDataSchema.parse(event.data.json());
    const options: NotificationOptions = {
      ...otherOptions,
      icon: '/android-chrome-192x192.png',
      badge: '/perfin_noti_badge.png',
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    if (err) {
      console.error(err);
    }
  }
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = event.notification.data?.targetUrl || '/';
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(absoluteTargetUrl).then(focusedClient => {
            if (focusedClient) return focusedClient.focus();
          });
        }
      }
      if ('openWindow' in self.clients) {
        return self.clients.openWindow(absoluteTargetUrl);
      }
    }),
  );
});
