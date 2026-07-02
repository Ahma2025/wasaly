importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAXX_V5q5zxFKu_WDbTAJ8I1WQCZ5OqEkY",
  projectId: "wasaly-delivery-app",
  messagingSenderId: "573612310538",
  appId: "1:573612310538:android:6642b6d4053bd85e5f9ff3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification?.title || 'وصالي', {
    body: payload.notification?.body || '',
    icon: '/logo.png',
    requireInteraction: true,
    dir: 'rtl'
  });
});
