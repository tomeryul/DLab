/* ===== FCM background message handler =====
   Required to live at /firebase-messaging-sw.js for FCM Web Push to work in PWAs.
   Coexists with sw.js (different file, different registration). */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAsVBai3D8ojfynejbtiGWsxvCe7bqjQ9c",
  authDomain: "flylab-c1f97.firebaseapp.com",
  projectId: "flylab-c1f97",
  storageBucket: "flylab-c1f97.firebasestorage.app",
  messagingSenderId: "228492768215",
  appId: "1:228492768215:web:994473718aed17ea305192"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || data.title || 'FlyLab alert';
  const body  = notif.body  || data.body  || '';
  self.registration.showNotification(title, {
    body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'flylab-alert',
    requireInteraction: true,
    data
  });
});

// Focus an open FlyLab tab when the notification is clicked, or open one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
