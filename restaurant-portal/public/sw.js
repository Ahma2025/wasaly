self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'وصلّي', body: event.data?.text() || '' }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'وصلّي', {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'order-' + (data.data?.order_id || Date.now()),
      requireInteraction: true,
      dir: 'rtl',
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then((clientList) => {
    for (const client of clientList) {
      if (client.url && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('/orders');
  }));
});
