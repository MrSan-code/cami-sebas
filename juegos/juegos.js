// Helpers shared by every game under /juegos/
(function () {
  const STORE_PREFIX = 'cys-juegos:';
  const PALETTE = ['#5d101f', '#ab5823', '#c58b78', '#707f75', '#b8a088'];
  // Folder this script lives in (/juegos/), so shared files resolve from the hub and from each game
  const BASE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  const GAME_NAMES = {
    'atrapa-el-ramo': 'Atrapa el ramo',
    'camino-al-altar': 'Camino al altar',
    'memoria': 'Memoria de parejas',
    'dale-al-novio': 'Dale al novio'
  };
  const LOWER_IS_BETTER = { memoria: true };

  // Launch lock: before this moment the games show a "coming soon" screen.
  // Change the date here to open earlier or later (Colombia time, UTC-5).
  const OPENS_AT = '2026-11-14T00:00:00-05:00';
  // SHA-256 of the secret in the preview link (?preview=...), so the secret itself is not in this file
  const PREVIEW_HASH = 'c941c12999b70e8ee6e7094f589bdb24100fd9768c92747cb66d893602cbaee8';

  // localStorage can throw (private mode, blocked site data): games must work without it
  function read(key) {
    try {
      return localStorage.getItem(STORE_PREFIX + key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, value);
    } catch (e) { /* value just won't persist */ }
  }

  // Same "?to=Name+Other%20Name" convention as the save-the-date (script.js)
  function guestNames() {
    const match = window.location.search.match(/[?&]to=([^&]*)/);
    if (!match) return [];
    return match[1].split('+').map(n => {
      try {
        return decodeURIComponent(n).trim();
      } catch (e) {
        return n.trim();
      }
    }).filter(Boolean);
  }

  function joinNames(names) {
    if (names.length <= 1) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
  }

  function getBest(game) {
    return parseInt(read(game), 10) || 0;
  }

  // lowerIsBetter: for games scored by attempts, where fewer wins
  function saveBest(game, score, lowerIsBetter) {
    const best = getBest(game);
    if (lowerIsBetter ? (best && score >= best) : score <= best) return false;
    write(game, String(score));
    return true;
  }

  function share(text) {
    const url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      navigator.share({ text: text, url: url }).catch(function () { });
      return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener');
  }

  // ---- Sound: tiny synthesized effects, no audio files ----
  // Each note: [frequency, start offset (s), duration (s), wave, optional slide-to frequency]
  const SOUNDS = {
    pick: [[660, 0, .09, 'sine'], [990, .06, .12, 'sine']],
    bonus: [[784, 0, .08, 'triangle'], [1047, .07, .08, 'triangle'], [1319, .14, .18, 'triangle']],
    bad: [[196, 0, .2, 'sawtooth', 120], [130, .12, .26, 'sawtooth', 80]],
    miss: [[260, 0, .14, 'triangle', 170]],
    flap: [[430, 0, .08, 'sine', 640]],
    flip: [[540, 0, .05, 'triangle']],
    match: [[659, 0, .1, 'sine'], [880, .09, .18, 'sine']],
    hit: [[190, 0, .09, 'square', 80]],
    tick: [[880, 0, .05, 'sine']],
    go: [[1175, 0, .22, 'sine']],
    over: [[392, 0, .16, 'triangle'], [330, .15, .16, 'triangle'], [262, .3, .32, 'triangle']],
    win: [[523, 0, .12, 'triangle'], [659, .11, .12, 'triangle'], [784, .22, .12, 'triangle'], [1047, .33, .32, 'triangle']]
  };
  const WAVE_GAIN = { sine: .16, triangle: .14, square: .05, sawtooth: .05 };

  let audio = null;
  let muted = read('mute') === '1';

  function sfx(name) {
    if (muted || !SOUNDS[name]) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime;
      SOUNDS[name].forEach(function (note) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const start = now + note[1];
        const end = start + note[2];
        osc.type = note[3];
        osc.frequency.setValueAtTime(note[0], start);
        if (note[4]) osc.frequency.exponentialRampToValueAtTime(note[4], end);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(WAVE_GAIN[note[3]], start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(end + 0.02);
      });
    } catch (e) { /* audio is optional */ }
  }

  function bindSoundToggle(btn) {
    function render() {
      btn.classList.toggle('is-muted', muted);
      btn.setAttribute('aria-pressed', String(!muted));
      btn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
    }
    btn.addEventListener('click', function () {
      muted = !muted;
      write('mute', muted ? '1' : '0');
      render();
      sfx('tick');
    });
    render();
  }

  // ---- Canvas helpers ----
  // SVG sprites are rasterized once: drawing an SVG image every frame is slow on phones
  function sprite(url, size) {
    const s = { canvas: null, size: size };
    const img = new Image();
    img.onload = function () {
      const px = Math.round(size * 3);
      const c = document.createElement('canvas');
      c.width = c.height = px;
      c.getContext('2d').drawImage(img, 0, 0, px, px);
      s.canvas = c;
    };
    img.src = url;
    return s;
  }

  function drawSprite(ctx, s, x, y, scale) {
    if (!s.canvas) return;
    const size = s.size * (scale || 1);
    ctx.drawImage(s.canvas, x - size / 2, y - size / 2, size, size);
  }

  // Particles and floating score labels for the canvas games
  function fx() {
    const parts = [];
    const labels = [];
    return {
      burst: function (x, y, colors, count, power) {
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (power || 150) * (0.35 + Math.random() * 0.65);
          parts.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (power || 150) * 0.4,
            life: 0.5 + Math.random() * 0.4,
            size: 3 + Math.random() * 4,
            rot: Math.random() * 6,
            color: colors[i % colors.length]
          });
        }
      },
      label: function (text, x, y, color, size) {
        labels.push({ text: text, x: x, y: y, life: 0.9, color: color, size: size || 20 });
      },
      clear: function () {
        parts.length = 0;
        labels.length = 0;
      },
      update: function (dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life -= dt;
          p.vy += 520 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += 6 * dt;
          if (p.life <= 0) parts.splice(i, 1);
        }
        for (let i = labels.length - 1; i >= 0; i--) {
          labels[i].life -= dt;
          labels[i].y -= 46 * dt;
          if (labels[i].life <= 0) labels.splice(i, 1);
        }
      },
      draw: function (ctx) {
        for (const p of parts) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, p.life * 2.5);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const l of labels) {
          ctx.globalAlpha = Math.min(1, l.life * 2);
          ctx.font = '600 ' + l.size + 'px Montserrat, sans-serif';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(251, 248, 243, .9)';
          ctx.strokeText(l.text, l.x, l.y);
          ctx.fillStyle = l.color;
          ctx.fillText(l.text, l.x, l.y);
        }
        ctx.globalAlpha = 1;
      }
    };
  }

  // ---- DOM effects ----
  function shake(stage) {
    stage.classList.remove('is-hit');
    void stage.offsetWidth; // restart the animation
    stage.classList.add('is-hit');
    if (navigator.vibrate) navigator.vibrate(80);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function confetti(container) {
    if (reducedMotion()) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const fall = container.clientHeight + 40;
    for (let i = 0; i < 46; i++) {
      const bit = document.createElement('i');
      bit.style.left = Math.random() * 100 + '%';
      bit.style.background = PALETTE[i % PALETTE.length];
      bit.style.setProperty('--fall', fall + 'px');
      bit.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
      bit.style.setProperty('--spin', (Math.random() * 900 - 450) + 'deg');
      bit.style.animationDelay = (Math.random() * 0.5) + 's';
      bit.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
      layer.appendChild(bit);
    }
    container.appendChild(layer);
    setTimeout(function () {
      layer.remove();
    }, 3600);
  }

  // Timer-based (not requestAnimationFrame) so it still finishes in a background tab
  function countUp(el, to) {
    if (reducedMotion() || to <= 0) {
      el.textContent = to;
      return;
    }
    const started = Date.now();
    const duration = Math.min(900, 250 + to * 18);
    const timer = setInterval(function () {
      const t = Math.min(1, (Date.now() - started) / duration);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t >= 1) clearInterval(timer);
    }, 30);
  }

  // Short banner inside the stage ("Racha x2", "¡10 arcos!")
  function toast(el, text) {
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('is-pop');
    void el.offsetWidth;
    el.classList.add('is-pop');
  }

  // 3-2-1 before a round starts
  function countdown(stage, done) {
    const el = document.createElement('div');
    el.className = 'countdown';
    stage.appendChild(el);
    let n = 3;
    function step() {
      if (n === 0) {
        el.remove();
        sfx('go');
        done();
        return;
      }
      el.textContent = n;
      el.classList.remove('is-pop');
      void el.offsetWidth;
      el.classList.add('is-pop');
      sfx('tick');
      n--;
      setTimeout(step, 650);
    }
    step();
  }

  // Highest `min` the score reaches wins
  function verdict(list, score) {
    let text = list[0].text;
    for (const v of list) {
      if (score >= v.min) text = v.text;
    }
    return text;
  }

  // Fills and shows the shared game-over panel. Returns true on a new record.
  function finish(o) {
    const isRecord = saveBest(o.game, o.score, o.lowerIsBetter);
    const stage = document.getElementById('stage');
    const bestEl = document.getElementById('finalBest');
    const starsEl = document.getElementById('stars');
    document.getElementById('overTitle').textContent = o.title;
    document.getElementById('verdict').textContent = o.verdict;
    countUp(document.getElementById('finalScore'), o.score);
    bestEl.textContent = isRecord ? '¡Nuevo récord!' : 'Tu récord: ' + getBest(o.game);
    bestEl.classList.toggle('is-record', isRecord);
    if (starsEl) {
      starsEl.hidden = !o.stars;
      if (o.stars) {
        starsEl.innerHTML = [1, 2, 3].map(function (n) {
          return '<span' + (n <= o.stars ? ' class="on"' : '') + '>★</span>';
        }).join('');
        starsEl.setAttribute('aria-label', o.stars + ' de 3 estrellas');
      }
    }
    document.getElementById('overPanel').hidden = false;
    sfx(isRecord || o.win ? 'win' : 'over');
    if (isRecord || o.win) confetti(stage);
    showPodium(o.game, o.score);
    return isRecord;
  }

  // ---- Guest identity and shared leaderboard (Cloudflare Worker under /api) ----
  const API = window.JUEGOS_API || read('api') || '/api';
  let guestsPromise = null;
  let podiumPromise = null;

  function me() {
    try {
      const guest = JSON.parse(read('guest'));
      return guest && guest.id ? guest : null;
    } catch (e) {
      return null;
    }
  }

  function loadGuests() {
    if (!guestsPromise) {
      guestsPromise = fetch(BASE + 'invitados.json')
        .then(function (r) {
          return r.json();
        })
        .catch(function () {
          return [];
        });
    }
    return guestsPromise;
  }

  function api(path, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, 6000);
    return fetch(API + path, Object.assign({ signal: ctrl.signal }, options))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  // Resolves to null when the API is unreachable: the games still work, just without a podium
  function loadPodium() {
    if (!podiumPromise) {
      podiumPromise = api('/podio').catch(function () {
        return null;
      });
    }
    return podiumPromise;
  }

  function submitScore(game, score) {
    const who = me();
    if (!who) return Promise.resolve(null);
    podiumPromise = null;
    return api('/puntaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: game, guest: who.id, score: score })
    }).catch(function () {
      return null;
    });
  }

  function podiumRow(pos, name, score, isMe) {
    const row = document.createElement('li');
    row.className = 'podium-row' + (isMe ? ' is-me' : '');
    row.dataset.pos = pos;
    [['podium-pos', pos], ['podium-name', name], ['podium-score', score]].forEach(function (cell) {
      const span = document.createElement('span');
      span.className = cell[0];
      span.textContent = cell[1];
      row.appendChild(span);
    });
    return row;
  }

  // top: [{guest, name, score}], mine: {rank, best} when the viewer has a score in this game
  function renderPodium(el, top, mine) {
    const who = me();
    el.textContent = '';
    if (!top.length) {
      const empty = document.createElement('p');
      empty.className = 'podium-empty';
      empty.textContent = 'Aún no hay puntajes. ¡Sé el primero!';
      el.appendChild(empty);
      return;
    }
    const list = document.createElement('ol');
    list.className = 'podium-list';
    top.slice(0, 3).forEach(function (row, i) {
      list.appendChild(podiumRow(i + 1, row.name, row.score, !!who && row.guest === who.id));
    });
    if (who && mine && mine.rank > 3) {
      list.appendChild(podiumRow(mine.rank, who.name, mine.best, true));
    }
    el.appendChild(list);
  }

  // Game-over panel: send the score, then show the top 3 and the player's place
  function showPodium(game, score) {
    const el = document.getElementById('podium');
    if (!el) return;
    el.hidden = true;
    const valid = score > 0;

    if (!me()) {
      loadPodium().then(function (all) {
        if (!all) return;
        el.textContent = '';
        const ask = document.createElement('button');
        ask.type = 'button';
        ask.className = 'btn btn-link';
        ask.textContent = 'Elige tu nombre para entrar al podio';
        ask.addEventListener('click', function () {
          pickGuest().then(function (guest) {
            if (guest) showPodium(game, score);
          });
        });
        el.appendChild(ask);
        el.hidden = false;
      });
      return;
    }

    (valid ? submitScore(game, score) : Promise.resolve(null)).then(function (res) {
      if (res) {
        renderPodium(el, res.top, { rank: res.rank, best: res.best });
        el.hidden = false;
        return;
      }
      loadPodium().then(function (all) {
        if (!all) return;
        renderPodium(el, all[game] || [], null);
        el.hidden = false;
      });
    });
  }

  function renderHubPodium() {
    const el = document.getElementById('hubPodium');
    if (!el) return;
    loadPodium().then(function (all) {
      if (!all) {
        el.hidden = true;
        return;
      }
      el.textContent = '';
      const title = document.createElement('h2');
      title.className = 'script-title';
      title.textContent = 'Podio';
      el.appendChild(title);
      Object.keys(GAME_NAMES).forEach(function (game) {
        const block = document.createElement('section');
        block.className = 'hub-podium-game';
        const name = document.createElement('h3');
        name.textContent = GAME_NAMES[game] + (LOWER_IS_BETTER[game] ? ' · menos intentos' : '');
        const board = document.createElement('div');
        block.appendChild(name);
        block.appendChild(board);
        renderPodium(board, all[game] || [], null);
        el.appendChild(block);
      });
      el.hidden = false;
    });
  }

  function renderWhoami() {
    const who = me();
    document.querySelectorAll('[data-whoami]').forEach(function (el) {
      el.textContent = '';
      if (who) {
        el.appendChild(document.createTextNode('Jugando como '));
        const name = document.createElement('b');
        name.textContent = who.name;
        el.appendChild(name);
      }
      const change = document.createElement('button');
      change.type = 'button';
      change.textContent = who ? 'Cambiar' : 'Elegir mi nombre';
      change.addEventListener('click', function () {
        pickGuest();
      });
      el.appendChild(change);
    });
  }

  function plain(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Modal with the guest list. Resolves to the chosen guest, or null if dismissed.
  function pickGuest() {
    return loadGuests().then(function (guests) {
      if (!guests.length || document.querySelector('.picker')) return null;
      return new Promise(function (resolve) {
        // Names from the invitation link (?to=) go first
        const invited = guestNames().map(plain);
        const isInvited = function (g) {
          return invited.some(function (n) {
            return n.length > 2 && plain(g.name).indexOf(n) === 0;
          });
        };
        const ordered = guests.filter(isInvited).concat(guests.filter(function (g) {
          return !isInvited(g);
        }));

        const modal = document.createElement('div');
        modal.className = 'picker';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', '¿Quién eres?');
        modal.innerHTML =
          '<div class="picker-card">' +
          '<p class="eyebrow">Podio de invitados</p>' +
          '<h2 class="script-title">¿Quién eres?</h2>' +
          '<p class="body-txt">Elige tu nombre para que tus puntajes aparezcan en el podio.</p>' +
          '<input class="picker-search" type="search" placeholder="Busca tu nombre" aria-label="Busca tu nombre" autocomplete="off">' +
          '<ul class="picker-list"></ul>' +
          '<button class="btn btn-link" type="button">Ahora no</button>' +
          '</div>';
        const list = modal.querySelector('.picker-list');
        const search = modal.querySelector('.picker-search');

        function close(guest) {
          modal.remove();
          if (guest) {
            write('guest', JSON.stringify(guest));
            renderWhoami();
            renderHubPodium();
          } else {
            try {
              sessionStorage.setItem(STORE_PREFIX + 'skip-guest', '1');
            } catch (e) { /* will just ask again next page */ }
          }
          resolve(guest || null);
        }

        ordered.forEach(function (guest) {
          const item = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'picker-name' + (isInvited(guest) ? ' is-suggested' : '');
          btn.textContent = guest.name;
          btn.addEventListener('click', function () {
            close(guest);
          });
          item.dataset.key = plain(guest.name);
          item.appendChild(btn);
          list.appendChild(item);
        });

        search.addEventListener('input', function () {
          const term = plain(search.value.trim());
          list.querySelectorAll('li').forEach(function (item) {
            item.hidden = item.dataset.key.indexOf(term) === -1;
          });
        });
        modal.querySelector('.btn-link').addEventListener('click', function () {
          close(null);
        });
        document.body.appendChild(modal);
      });
    });
  }

  // Adds the identity line and podium slots, so the pages don't repeat this markup
  function mountIdentity() {
    document.querySelectorAll('.hub-head, .overlay-inner').forEach(function (host) {
      const line = document.createElement('p');
      line.className = 'whoami';
      line.setAttribute('data-whoami', '');
      host.appendChild(line);
    });
    const actions = document.querySelector('#overPanel .overlay-actions');
    if (actions) {
      const podium = document.createElement('div');
      podium.className = 'podium';
      podium.id = 'podium';
      podium.hidden = true;
      actions.parentNode.insertBefore(podium, actions);
    }
    const hubList = document.querySelector('.hub-list');
    if (hubList) {
      const hub = document.createElement('section');
      hub.className = 'hub-podium';
      hub.id = 'hubPodium';
      hub.hidden = true;
      hubList.parentNode.insertBefore(hub, hubList.nextSibling);
    }
    renderWhoami();
    renderHubPodium();

    let skipped = false;
    try {
      skipped = sessionStorage.getItem(STORE_PREFIX + 'skip-guest') === '1';
    } catch (e) { /* ask */ }
    if (!me() && !skipped) pickGuest();
  }

  // ---- Launch lock ----
  function isLocalHost() {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  }

  function isLocked() {
    return Date.now() < Date.parse(OPENS_AT) && read('preview') !== '1' && !isLocalHost();
  }

  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buffer) {
      return Array.from(new Uint8Array(buffer)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  // A valid ?preview= link unlocks this browser for good and is removed from the address bar
  function checkPreviewLink() {
    const match = window.location.search.match(/[?&]preview=([^&]+)/);
    if (!match || !window.crypto || !crypto.subtle) return Promise.resolve(false);
    return sha256(decodeURIComponent(match[1])).then(function (hash) {
      if (hash !== PREVIEW_HASH) return false;
      write('preview', '1');
      const clean = window.location.search.replace(/([?&])preview=[^&]+&?/, '$1').replace(/[?&]$/, '');
      window.history.replaceState(null, '', window.location.pathname + clean);
      return true;
    }).catch(function () {
      return false;
    });
  }

  function showLock() {
    const main = document.querySelector('main');
    if (main) main.hidden = true;
    const opens = new Date(OPENS_AT).toLocaleDateString('es', { day: 'numeric', month: 'long' });
    const lock = document.createElement('div');
    lock.className = 'locked';
    lock.innerHTML =
      '<div class="locked-card">' +
      '<img class="hub-logo" src="' + BASE + '../assets/Logo.webp" alt="Cami &amp; Sebas">' +
      '<p class="eyebrow">Cami &amp; Sebas · 14.11.2026</p>' +
      '<h1 class="script-title">Muy pronto</h1>' +
      '<p class="body-txt">Estamos preparando algo para ti. Los juegos se abren el <strong></strong>.</p>' +
      '</div>';
    lock.querySelector('strong').textContent = opens;
    document.body.appendChild(lock);
    return lock;
  }

  // Keep the guest's ?to= while moving between hub and games
  function keepQuery() {
    // The preview secret stays out of the links so it can't be passed along by accident
    const search = window.location.search.replace(/([?&])preview=[^&]+&?/, '$1').replace(/[?&]$/, '');
    if (!search) return;
    document.querySelectorAll('a[data-keep-query]').forEach(a => {
      a.setAttribute('href', a.getAttribute('href') + search);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    keepQuery();
    const greeting = joinNames(guestNames());
    document.querySelectorAll('[data-guest]').forEach(el => {
      if (greeting) el.textContent = el.dataset.guest.replace('{names}', greeting);
    });
    document.querySelectorAll('[data-best]').forEach(el => {
      const best = getBest(el.dataset.best);
      if (best) el.textContent = 'Tu récord: ' + best + (el.dataset.bestUnit ? ' ' + el.dataset.bestUnit : '');
    });
    document.querySelectorAll('[data-sound-toggle]').forEach(bindSoundToggle);

    if (!isLocked()) {
      checkPreviewLink();
      mountIdentity();
    } else {
      const lock = showLock();
      checkPreviewLink().then(function (unlocked) {
        if (!unlocked) return;
        lock.remove();
        document.querySelector('main').hidden = false;
        // Canvas games measured a hidden stage; let them measure again
        window.dispatchEvent(new Event('resize'));
        mountIdentity();
      });
    }
    // Leftover confetti must not cover the next round
    const again = document.getElementById('againBtn');
    if (again) {
      again.addEventListener('click', function () {
        document.querySelectorAll('.confetti').forEach(layer => layer.remove());
      });
    }
  });

  window.Juegos = {
    guestNames, joinNames, getBest, saveBest, share,
    sfx, sprite, drawSprite, fx, shake, confetti, toast, countdown, verdict, finish,
    me, pickGuest
  };
})();
