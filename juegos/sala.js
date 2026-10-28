// Client for the multiplayer rooms: connection, lobby, countdown and results.
// Each game page only draws its own round and sends its own inputs.
window.Sala = (function () {
  const TAP_FLUSH_MS = 200;
  const RETRY_MS = 1500;
  const AVATAR_COLORS = ['#5d101f', '#ab5823', '#c58b78', '#707f75', '#4b584f', '#b8a088', '#7a2232', '#c39a52'];
  const GUESTS_URL = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '') + 'invitados.json';

  function plain(text) {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }

  // Guest list to invite from: who has the site open goes first and gets the invitation live;
  // anyone else gets the room link through the phone's share sheet
  function openInvite(config, room) {
    const title = document.title.split(' — ')[0];
    const shareText = 'Entra a jugar ' + title + ' conmigo en la boda de Cami & Sebas.';
    const who = Juegos.me();
    if (!window.Buzon || !who) {
      Juegos.share(shareText);
      return;
    }
    if (document.querySelector('.picker')) return;

    const modal = document.createElement('div');
    modal.className = 'picker';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Invitar a jugar');
    modal.innerHTML =
      '<div class="picker-card">' +
      '<p class="eyebrow"></p>' +
      '<h2 class="script-title">Invitar a jugar</h2>' +
      '<p class="body-txt">Si tiene la página abierta, le llega la invitación al instante.</p>' +
      '<input class="picker-search" type="search" placeholder="Busca un nombre" aria-label="Busca un nombre" autocomplete="off">' +
      '<ul class="picker-list"><li class="invite-loading">Buscando quién está conectado…</li></ul>' +
      '<button class="btn btn-link" type="button" data-share>Compartir enlace</button>' +
      '<button class="btn btn-link" type="button" data-close>Cerrar</button>' +
      '</div>';
    modal.querySelector('.eyebrow').textContent = title;
    const list = modal.querySelector('.picker-list');
    const search = modal.querySelector('.picker-search');
    modal.querySelector('[data-close]').addEventListener('click', function () {
      modal.remove();
    });
    modal.querySelector('[data-share]').addEventListener('click', function () {
      Juegos.share(shareText);
    });
    search.addEventListener('input', function () {
      const term = plain(search.value.trim());
      list.querySelectorAll('li[data-key]').forEach(function (item) {
        item.hidden = item.dataset.key.indexOf(term) === -1;
      });
    });
    document.body.appendChild(modal);

    Promise.all([
      fetch(GUESTS_URL).then(function (r) { return r.json(); }).catch(function () { return []; }),
      window.Buzon.online()
    ]).then(function (both) {
      const online = both[1];
      const guests = both[0].filter(function (g) { return g.id !== who.id; });
      const ordered = guests.filter(function (g) { return online.has(g.id); })
        .concat(guests.filter(function (g) { return !online.has(g.id); }));
      list.textContent = '';

      ordered.forEach(function (guest) {
        const isOnline = online.has(guest.id);
        const item = document.createElement('li');
        item.dataset.key = plain(guest.name);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'picker-name invite-name' + (isOnline ? ' is-online' : '');
        const name = document.createElement('span');
        name.textContent = guest.name;
        const state = document.createElement('small');
        state.textContent = isOnline ? 'En línea' : 'Enviar enlace';
        btn.appendChild(name);
        btn.appendChild(state);

        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          if (!online.has(guest.id)) {
            Juegos.share(shareText);
            return;
          }
          btn.disabled = true;
          state.textContent = 'Enviando…';
          window.Buzon.invite(guest.id, config.game, room).then(function (res) {
            if (res.ok) {
              btn.classList.add('is-sent');
              state.textContent = 'Invitación enviada';
              return;
            }
            btn.disabled = false;
            if (res.reason === 'wait') {
              state.textContent = 'Espera un momento';
            } else {
              // Gone offline, or the invitation service is down: the link still works
              online.delete(guest.id);
              btn.classList.remove('is-online');
              state.textContent = 'No le llegó · Enviar enlace';
            }
          });
        });

        item.appendChild(btn);
        list.appendChild(item);
      });
      if (search.value) search.dispatchEvent(new Event('input'));
    });
  }

  // Round badge with the guest's initials; the colour is always the same for the same guest
  function avatar(player) {
    let hash = 0;
    for (let i = 0; i < player.id.length; i++) hash = (hash * 31 + player.id.charCodeAt(i)) >>> 0;
    const words = player.name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
    const el = document.createElement('span');
    el.className = 'avatar';
    el.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
    el.textContent = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
    return el;
  }

  function open(config) {
    const room = (new URLSearchParams(window.location.search).get('sala') || 'boda').toLowerCase();
    const stage = document.getElementById('stage');
    const lobby = document.getElementById('lobby');
    const results = document.getElementById('results');
    const startBtn = document.getElementById('startBtn');
    const statusEl = document.getElementById('status');
    const onlineEl = document.getElementById('online');
    const countEl = document.getElementById('lobbyCount');
    const chipsEl = document.getElementById('lobbyPlayers');
    const nextEl = document.getElementById('nextIn');

    let ws = null;
    let state = null;
    let phaseEnds = 0; // local clock time at which the current phase ends
    let countdownEl = null;
    let lastPhase = '';
    let stopped = false;

    function me() {
      const who = Juegos.me();
      return state && who ? state.players.find(function (p) {
        return p.id === who.id;
      }) || null : null;
    }

    function send(message) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(message));
    }

    function socketUrl() {
      const who = Juegos.me();
      const api = Juegos.apiBase();
      const base = /^https?:/.test(api)
        ? api.replace(/^http/, 'ws')
        : (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + api;
      return base + '/sala?game=' + encodeURIComponent(config.game) + '&sala=' + encodeURIComponent(room) +
        '&guest=' + encodeURIComponent(who.id);
    }

    function connect() {
      if (stopped || !Juegos.me()) return;
      statusEl.textContent = 'Conectando…';
      ws = new WebSocket(socketUrl());
      ws.onopen = function () {
        statusEl.textContent = '';
      };
      ws.onmessage = function (event) {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (message.t === 'state') apply(message);
      };
      ws.onclose = function (event) {
        if (stopped) return;
        state = null;
        lobby.hidden = false;
        results.hidden = true;
        startBtn.disabled = true;
        if (event.code === 4000) {
          statusEl.textContent = 'Abriste este juego en otro dispositivo.';
          stopped = true;
          return;
        }
        statusEl.textContent = event.code === 4001 ? 'La sala estaba en pausa. Volviendo…' : 'Reconectando…';
        setTimeout(connect, RETRY_MS);
      };
    }

    function chip(player, isMe) {
      const li = document.createElement('li');
      li.appendChild(avatar(player));
      li.appendChild(document.createTextNode(player.name.split(' ')[0]));
      if (isMe) li.className = 'is-me';
      return li;
    }

    // First three on a pedestal, tallest step in the middle
    function pedestal(ranking, who) {
      const wrap = document.createElement('div');
      wrap.className = 'pedestal';
      [1, 0, 2].forEach(function (index) {
        const entry = ranking[index];
        if (!entry) return;
        const step = document.createElement('div');
        step.className = 'pedestal-step' + (who && entry.id === who.id ? ' is-me' : '');
        step.dataset.pos = index + 1;
        step.appendChild(avatar(entry));
        const name = document.createElement('b');
        name.textContent = entry.name.split(' ')[0];
        const value = document.createElement('span');
        value.textContent = entry.value + (entry.unit ? ' ' + entry.unit : '');
        const block = document.createElement('i');
        block.textContent = index + 1;
        step.appendChild(name);
        step.appendChild(value);
        step.appendChild(block);
        wrap.appendChild(step);
      });
      return wrap;
    }

    function row(pos, entry, isMe) {
      const li = document.createElement('li');
      li.className = 'podium-row' + (isMe ? ' is-me' : '');
      li.dataset.pos = pos;
      [['podium-pos', pos], ['podium-name', entry.name], ['podium-score', entry.value + (entry.unit ? ' ' + entry.unit : '')]]
        .forEach(function (cell) {
          const span = document.createElement('span');
          span.className = cell[0];
          span.textContent = cell[1];
          li.appendChild(span);
        });
      return li;
    }

    function apply(next) {
      state = next;
      phaseEnds = performance.now() + next.left;
      const who = Juegos.me();
      const count = next.players.length;
      onlineEl.textContent = count + ' en sala';

      // Lobby
      lobby.hidden = next.phase !== 'lobby';
      if (next.phase === 'lobby') {
        countEl.textContent = count === 1 ? 'Solo estás tú. Invita a más gente.' : count + ' listos para jugar';
        chipsEl.textContent = '';
        next.players.slice(0, 40).forEach(function (p) {
          chipsEl.appendChild(chip(p, who && p.id === who.id));
        });
        if (count > 40) {
          const more = document.createElement('li');
          more.textContent = '+' + (count - 40);
          chipsEl.appendChild(more);
        }
        startBtn.disabled = count < next.min;
        startBtn.textContent = count < next.min ? 'Faltan jugadores' : 'Empezar';
      }

      // Results
      results.hidden = next.phase !== 'results';
      if (next.phase === 'results' && lastPhase !== 'results' && next.results) {
        document.getElementById('headline').textContent = next.results.headline;
        const list = document.getElementById('ranking');
        list.textContent = '';
        const ranking = next.results.ranking;
        const old = results.querySelector('.pedestal');
        if (old) old.remove();
        list.parentNode.insertBefore(pedestal(ranking, who), list);
        ranking.slice(3, 6).forEach(function (entry, i) {
          list.appendChild(row(i + 4, entry, who && entry.id === who.id));
        });
        const mine = who ? ranking.findIndex(function (entry) {
          return entry.id === who.id;
        }) : -1;
        if (mine >= 6) list.appendChild(row(mine + 1, ranking[mine], true));
        Juegos.sfx('win');
        if (mine === 0) Juegos.confetti(stage);
      }

      if (next.phase === 'countdown' && lastPhase !== 'countdown') Juegos.sfx('go');
      if (next.phase !== 'countdown' && countdownEl) {
        countdownEl.remove();
        countdownEl = null;
      }
      lastPhase = next.phase;
      config.render(next, me());
    }

    // Local clock for the numbers that tick between server messages
    setInterval(function () {
      if (!state) return;
      const left = Math.max(0, phaseEnds - performance.now());
      if (state.phase === 'countdown') {
        if (!countdownEl) {
          countdownEl = document.createElement('div');
          countdownEl.className = 'countdown';
          stage.appendChild(countdownEl);
        }
        const n = Math.max(1, Math.ceil(left / 1000));
        if (countdownEl.textContent !== String(n)) {
          countdownEl.textContent = n;
          Juegos.sfx('tick');
        }
      }
      if (state.phase === 'results') nextEl.textContent = 'De vuelta a la sala en ' + Math.ceil(left / 1000) + ' s';
    }, 100);

    startBtn.addEventListener('click', function () {
      send({ t: 'start' });
    });
    document.getElementById('inviteBtn').addEventListener('click', function () {
      openInvite(config, room);
    });

    // Needs a name from the guest list before joining
    if (Juegos.me()) connect();
    else statusEl.textContent = 'Elige tu nombre para entrar a la sala.';
    document.addEventListener('juegos:guest', function () {
      if (ws) ws.close();
      else connect();
    });
    // Phones drop the socket when the screen locks: come back as soon as the page is visible again
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !stopped && (!ws || ws.readyState > 1)) connect();
    });

    return {
      send: send,
      me: me,
      avatar: avatar,
      state: function () {
        return state;
      },
      // Counts quick taps on an element and reports them to the server in small batches
      tapper: function (el, onTap) {
        let pending = 0;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          if (!state || state.phase !== 'playing') return;
          pending++;
          if (onTap) onTap();
        });
        setInterval(function () {
          if (pending) send({ t: 'tap', n: pending });
          pending = 0;
        }, TAP_FLUSH_MS);
      }
    };
  }

  return { open: open };
})();
