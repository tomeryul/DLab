/* ===== Service worker registration ===== */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) { console.log('SW registration skipped:', err); });
  });
}
