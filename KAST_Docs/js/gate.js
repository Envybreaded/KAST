/* Visitor gate. One visitor, identified only by a SHA-256 hash of their public IP (the address
   itself is not stored here), gets a single full-screen message instead of the site. */
(function () {
  var BLOCKED = ['c40d726143ea44f7fadc097b9151e41b840286565f35876b3729c17ebdceb9e7'];
  if (!window.fetch || !window.crypto || !crypto.subtle || !window.TextEncoder) return;
  fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(j.ip).trim())); })
    .then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      if (BLOCKED.indexOf(hex) < 0) return;
      window.KAST_GATED = true;
      document.title = 'KAST';
      document.body.innerHTML =
        '<div class="gate"><img src="assets/kast-emblem-256.png" alt="" onerror="this.remove()">' +
        '<p class="gate-kicker">Horizon Space Center · Access denied</p>' +
        '<h1>Get the fuck out<br>you commie</h1>' +
        '<p class="gate-foot">This facility is closed to KOSMOS personnel.</p></div>';
      window.addEventListener('hashchange', function (e) { e.stopImmediatePropagation(); }, true);
    })
    .catch(function () { /* lookup failed: show the site as normal */ });
})();
