/* ===== Service worker registration ===== */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) { console.log('SW registration skipped:', err); });
    // FCM background push handler (separate SW required to live at this exact path)
    navigator.serviceWorker.register('firebase-messaging-sw.js').catch(function (err) { console.log('FCM SW registration skipped:', err); });
  });
}
