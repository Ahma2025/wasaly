// Service worker لإشعارات الويب (متصفح الكمبيوتر)
const BASE = self.registration.scope; // ينتهي بـ "/" — يعمل على الجذر وتحت /portal/
const ICON = BASE + 'logo.png';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'وصلّي', body: (event.data && event.data.text()) || '' }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'وصلّي', {
      body: data.body || '',
      icon: ICON,
      badge: ICON,
      tag: 'order-' + ((data.data && data.data.order_id) || Date.now()),
      requireInteraction: true,
      dir: 'rtl',
      lang: 'ar',
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = BASE + 'orders';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url && client.url.startsWith(BASE) && 'focus' in client) {
        if ('navigate' in client) client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(target);
  }));
});
