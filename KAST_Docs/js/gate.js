/* Visit log and visitor gate, both served by the kast-visits Cloudflare Worker.
   Each page view sends the page name; the worker records the visitor's IP and time.
   The worker also says whether this visitor is on the blocked list (the list itself
   lives only in the worker, not in this public file). */
(function () {
  var API = 'https://kast-visits.jasonstomas.workers.dev';

  function logView() {
    if (window.KAST_GATED) return;
    var body = JSON.stringify({ p: location.hash || '#/', r: document.referrer || '' });
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(API + '/hit', body); return; }
    } catch (e) { /* fall through to fetch */ }
    if (window.fetch) fetch(API + '/hit', { method: 'POST', body: body, keepalive: true, mode: 'no-cors' }).catch(function () {});
  }
  logView();
  window.addEventListener('hashchange', logView);

  if (!window.fetch) return;
  fetch(API + '/gate', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !j.b) return;
      window.KAST_GATED = true;
      document.title = 'KAST';
      document.body.innerHTML =
        '<div class="gate"><img src="assets/kast-emblem-256.png" alt="" onerror="this.remove()">' +
        '<p class="gate-kicker">Horizon Space Center · Access denied</p>' +
        '<h1>Get the fuck out<br>you commie</h1>' +
        '<p class="gate-foot">This facility is closed to KOSMOS personnel.</p></div>';
      window.addEventListener('hashchange', function (e) { e.stopImmediatePropagation(); }, true);
    })
    .catch(function () { /* worker unreachable: show the site as normal */ });
})();
