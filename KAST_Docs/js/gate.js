/* Visit log and visitor gate, both served by the kast-visits Cloudflare Worker.
   Each page view sends the page name; the worker records the visitor's address and time.
   The blocked list lives only in the worker and is managed from its private log page.
   The visitor's IPv4 address is looked up too, so people who connect over IPv6 can
   still be matched against an IPv4 entry. */
(function () {
  var API = 'https://kast-visits.jasonstomas.workers.dev';
  if (!window.fetch) return;
  var v4 = '';
  var shown = false;

  function logView() {
    if (shown) return;
    var body = JSON.stringify({ p: location.hash || '#/', r: document.referrer || '', v4: v4 });
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(API + '/hit', body); return; }
    } catch (e) { /* fall through to fetch */ }
    fetch(API + '/hit', { method: 'POST', body: body, keepalive: true, mode: 'no-cors' }).catch(function () {});
  }

  function gate() {
    if (shown) return;
    shown = true;
    window.KAST_GATED = true;
    document.title = 'KAST';
    document.body.innerHTML =
      '<div class="gate"><img src="assets/kast-emblem-256.png" alt="" onerror="this.remove()">' +
      '<p class="gate-kicker">Horizon Space Center · Access denied</p>' +
      '<h1>Get the fuck out<br>you commie</h1>' +
      '<p class="gate-foot">This facility is closed to KOSMOS personnel.</p></div>';
    window.addEventListener('hashchange', function (e) { e.stopImmediatePropagation(); }, true);
  }

  function start() {
    logView();
    window.addEventListener('hashchange', logView);
    fetch(API + '/gate?v4=' + encodeURIComponent(v4), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.b) gate(); })
      .catch(function () { /* worker unreachable: show the site as normal */ });
  }

  var started = false;
  function once() { if (!started) { started = true; start(); } }
  setTimeout(once, 1500);
  fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { v4 = String(j.ip || '').trim(); })
    .catch(function () {})
    .then(once);
})();
