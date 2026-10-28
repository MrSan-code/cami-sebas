// Live invitations to the multiplayer games, loaded on every page of the site.
// While a guest who already picked their name has any page open, they can get
// "Ana te invita a jugar ¡Salud!" from another guest and jump straight into the room.
(function () {
  if (window.Buzon) return;

  var GUEST_KEY = 'cys-juegos:guest';
  var GAME_NAMES = {
    'tira-y-afloja': 'Tira y afloja',
    'carrera-al-altar': 'Carrera al altar',
    'cami-o-sebas': '¿Cami o Sebas?',
    'reflejos': '¡Salud!',
    'pasa-la-cuenta': 'Pasa la cuenta'
  };
  // buzon.js lives at the site root, so its own URL tells where the games are
  var ROOT = new URL('.', (document.currentScript && document.currentScript.src) || window.location.href);

  var ws = null;
  var guestId = null;
  var retryMs = 2000;
  var retryTimer = null;
  var pendingOnline = [];
  var pendingSent = {};
  // If the server is down nothing waits on it for longer than this
  var REPLY_TIMEOUT_MS = 5000;

  function withTimeout(promise, fallback) {
    return Promise.race([promise, new Promise(function (resolve) {
      setTimeout(function () { resolve(fallback); }, REPLY_TIMEOUT_MS);
    })]);
  }

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function me() {
    try {
      var guest = JSON.parse(read(GUEST_KEY));
      return guest && guest.id ? guest : null;
    } catch (e) {
      return null;
    }
  }

  function socketUrl(id) {
    var host = window.location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' || host === '';
    var api = read('cys-juegos:api') || (local ? 'http://127.0.0.1:8787/api' : null);
    var base = api
      ? api.replace(/^http/, 'ws')
      : (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/api';
    return base + '/buzon?guest=' + encodeURIComponent(id);
  }

  function connect() {
    clearTimeout(retryTimer);
    var guest = me();
    if (!guest) {
      // Signed out: stop receiving invitations meant for the previous name
      if (ws) {
        var old = ws;
        ws = null;
        old.close();
      }
      return;
    }
    if (ws && ws.readyState <= 1 && guestId === guest.id) return;
    if (ws) ws.close();

    guestId = guest.id;
    var socket;
    try {
      socket = new WebSocket(socketUrl(guest.id));
    } catch (e) {
      return;
    }
    ws = socket;
    socket.onopen = function () {
      retryMs = 2000;
    };
    socket.onmessage = function (event) {
      var m;
      try {
        m = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!m) return;
      if (m.t === 'invite') showInvite(m);
      if (m.t === 'online') {
        var ids = new Set(m.ids || []);
        pendingOnline.splice(0).forEach(function (resolve) { resolve(ids); });
      }
      if (m.t === 'sent' && pendingSent[m.to]) {
        pendingSent[m.to].forEach(function (resolve) { resolve(m); });
        delete pendingSent[m.to];
      }
    };
    socket.onclose = function () {
      if (ws !== socket) return;
      ws = null;
      pendingOnline.splice(0).forEach(function (resolve) { resolve(new Set()); });
      Object.keys(pendingSent).forEach(function (to) {
        pendingSent[to].forEach(function (resolve) { resolve({ ok: false, reason: 'offline-me' }); });
      });
      pendingSent = {};
      if (document.hidden || !me()) return;
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    };
  }

  function whenOpen() {
    connect();
    return new Promise(function (resolve) {
      if (!ws) return resolve(false);
      if (ws.readyState === 1) return resolve(true);
      var socket = ws;
      var done = function (ok) {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('close', onClose);
        resolve(ok);
      };
      var onOpen = function () { done(true); };
      var onClose = function () { done(false); };
      socket.addEventListener('open', onOpen);
      socket.addEventListener('close', onClose);
    });
  }

  // ---- The invitation card ----
  function injectStyles() {
    if (document.getElementById('buzon-styles')) return;
    var style = document.createElement('style');
    style.id = 'buzon-styles';
    style.textContent =
      '.buzon-card{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));z-index:9999;' +
      'width:min(calc(100% - 32px),380px);transform:translate(-50%,24px);opacity:0;' +
      'transition:transform .35s ease,opacity .35s ease;background:#fbf8f3;color:#2f2a26;' +
      'border:1px solid rgba(171,88,35,.35);border-radius:18px;padding:18px 18px 14px;' +
      'box-shadow:0 18px 44px rgba(47,42,38,.28);font-family:Montserrat,system-ui,sans-serif;text-align:center}' +
      '.buzon-card.show{transform:translate(-50%,0);opacity:1}' +
      '.buzon-kicker{font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;font-weight:600;color:#ab5823;margin:0}' +
      '.buzon-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;line-height:1.25;margin:6px 0 14px}' +
      '.buzon-title b{font-weight:600}' +
      '.buzon-actions{display:flex;gap:8px;justify-content:center}' +
      '.buzon-go,.buzon-later{font:inherit;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:600;' +
      'border-radius:999px;padding:11px 18px;cursor:pointer;text-decoration:none;border:0}' +
      '.buzon-go{background:#5d101f;color:#fff}' +
      '.buzon-later{background:transparent;color:#5c544d;border:1px solid rgba(47,42,38,.2)}' +
      '@media (prefers-reduced-motion:reduce){.buzon-card{transition:none}}';
    document.head.appendChild(style);
  }

  function alreadyThere(game, sala) {
    var here = new URLSearchParams(window.location.search).get('sala') || 'boda';
    return window.location.pathname.indexOf('/juegos/multi/' + game + '/') !== -1 && here.toLowerCase() === sala;
  }

  function showInvite(m) {
    if (!GAME_NAMES[m.game] || alreadyThere(m.game, m.sala)) return;
    injectStyles();
    var old = document.querySelector('.buzon-card');
    if (old) old.remove();

    var card = document.createElement('div');
    card.className = 'buzon-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-live', 'assertive');
    card.innerHTML =
      '<p class="buzon-kicker">Te están invitando</p>' +
      '<p class="buzon-title"><b></b> te invita a jugar <b></b></p>' +
      '<div class="buzon-actions">' +
      '<a class="buzon-go">Ir a jugar</a>' +
      '<button class="buzon-later" type="button">Ahora no</button>' +
      '</div>';
    var names = card.querySelectorAll('.buzon-title b');
    names[0].textContent = m.from && m.from.name ? m.from.name.replace(/\s*\(.*\)\s*/g, ' ').trim() : 'Alguien';
    names[1].textContent = GAME_NAMES[m.game];
    var link = new URL('juegos/multi/' + m.game + '/', ROOT);
    if (m.sala && m.sala !== 'boda') link.searchParams.set('sala', m.sala);
    card.querySelector('.buzon-go').href = link.href;

    var hideTimer = setTimeout(close, 60000);
    function close() {
      clearTimeout(hideTimer);
      card.classList.remove('show');
      setTimeout(function () { card.remove(); }, 400);
    }
    card.querySelector('.buzon-later').addEventListener('click', close);

    document.body.appendChild(card);
    requestAnimationFrame(function () { card.classList.add('show'); });
    try {
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch (e) { /* not supported */ }
  }

  // ---- Public API for the game pages ----
  window.Buzon = {
    // Resolves to the Set of guest ids with the site open right now
    online: function () {
      return withTimeout(whenOpen(), false).then(function (open) {
        if (!open || !ws) return new Set();
        return withTimeout(new Promise(function (resolve) {
          pendingOnline.push(resolve);
          ws.send(JSON.stringify({ t: 'online' }));
        }), new Set());
      });
    },
    // Resolves to { ok, reason } where reason is 'offline', 'wait' or 'invalid'
    invite: function (to, game, sala) {
      return withTimeout(whenOpen(), false).then(function (open) {
        if (!open || !ws) return { ok: false, reason: 'offline-me' };
        return withTimeout(new Promise(function (resolve) {
          (pendingSent[to] = pendingSent[to] || []).push(resolve);
          ws.send(JSON.stringify({ t: 'invite', to: to, game: game, sala: sala || 'boda' }));
        }), { ok: false, reason: 'offline-me' });
      });
    }
  };

  // Reconnect when the screen comes back, and follow name changes from any tab
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) connect();
  });
  window.addEventListener('storage', function (event) {
    if (event.key === GUEST_KEY) connect();
  });
  document.addEventListener('juegos:guest', connect);

  connect();
})();
