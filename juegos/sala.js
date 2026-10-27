// Client for the multiplayer rooms: connection, lobby, countdown and results.
// Each game page only draws its own round and sends its own inputs.
window.Sala = (function () {
  const TAP_FLUSH_MS = 200;
  const RETRY_MS = 1500;
  const AVATAR_COLORS = ['#5d101f', '#ab5823', '#c58b78', '#707f75', '#4b584f', '#b8a088', '#7a2232', '#c39a52'];

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
      Juegos.share('Entra a jugar ' + document.title.split(' — ')[0] + ' conmigo en la boda de Cami & Sebas.');
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
