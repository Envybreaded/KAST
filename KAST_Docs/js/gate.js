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
  var shown = false;
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

  // Check 1: the worker, which sees the address the visitor actually connected from (IPv4 or IPv6).
  fetch(API + '/gate', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { if (j && j.b) gate(); })
    .catch(function () {});

  // Check 2: the visitor's IPv4 address, for visitors who reach the worker over IPv6.
  var V4 = ['c40d726143ea44f7fadc097b9151e41b840286565f35876b3729c17ebdceb9e7'];
  if (!window.crypto || !crypto.subtle || !window.TextEncoder) return;
  fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(j.ip).trim())); })
    .then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      if (V4.indexOf(hex) >= 0) gate();
    })
    .catch(function () {});
})();
