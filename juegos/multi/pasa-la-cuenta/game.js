(function () {
  const CHOICES = 6; // people offered when you have to hand the bill on
  const pad = document.getElementById('pad');
  const padText = document.getElementById('padText');
  const padSub = document.getElementById('padSub');
  const round = document.getElementById('round');
  const fuse = document.getElementById('fuse');
  const targets = document.getElementById('targets');
  const ring = document.getElementById('ring');

  let hadIt = false;
  let offered = []; // ids shown as targets for the current hold

  const sala = Sala.open({ game: 'pasa-la-cuenta', render: render });

  function firstNames(state, ids) {
    return ids.map(function (id) {
      const p = state.players.find(function (x) {
        return x.id === id;
      });
      return p ? p.name.split(' ')[0] : '';
    }).filter(Boolean).join(', ');
  }

  function pass(to) {
    sala.send({ t: 'pass', to: to });
    Juegos.sfx('flap');
    if (navigator.vibrate) navigator.vibrate(12);
  }

  // Who you can hand it to: a few names at a time, so a big room still fits on screen
  function renderTargets(state, me) {
    const free = state.players.filter(function (p) {
      return p.alive && p.id !== me.id && state.g.holders.indexOf(p.id) === -1;
    });
    offered = offered.filter(function (id) {
      return free.some(function (p) {
        return p.id === id;
      });
    });
    const pool = free.filter(function (p) {
      return offered.indexOf(p.id) === -1;
    }).sort(function () {
      return Math.random() - 0.5;
    });
    while (offered.length < Math.min(CHOICES, free.length) && pool.length) offered.push(pool.pop().id);

    targets.textContent = '';
    offered.forEach(function (id) {
      const p = free.find(function (x) {
        return x.id === id;
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'target';
      btn.appendChild(sala.avatar(p));
      btn.appendChild(document.createTextNode(p.name.split(' ')[0]));
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        pass(p.id);
      });
      targets.appendChild(btn);
    });
  }

  function renderRing(state, me) {
    ring.textContent = '';
    state.players.forEach(function (p) {
      const li = document.createElement('li');
      li.className = (p.alive ? '' : 'is-out ') + (state.g.holders.indexOf(p.id) !== -1 ? 'has-bill ' : '') + (me && p.id === me.id ? 'is-me' : '');
      li.appendChild(sala.avatar(p));
      li.appendChild(document.createTextNode(p.name.split(' ')[0]));
      ring.appendChild(li);
    });
  }

  function render(state, me) {
    const g = state.g;
    if (state.phase !== 'playing' || !g.stage) {
      pad.dataset.stage = 'idle';
      padText.textContent = 'La cuenta está por llegar…';
      padSub.textContent = '';
      round.textContent = '';
      targets.textContent = '';
      ring.textContent = '';
      fuse.dataset.heat = '0';
      hadIt = false;
      offered = [];
      return;
    }
    round.textContent = 'Ronda ' + g.round + ' · quedan ' + g.alive;
    fuse.dataset.heat = g.stage === 'boom' ? '4' : String(g.heat + 1);
    pad.dataset.heat = String(g.heat);
    renderRing(state, me);

    const holding = !!me && g.holders.indexOf(me.id) !== -1;
    if (holding && !hadIt) {
      Juegos.sfx('bad');
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      offered = [];
    }
    hadIt = holding;

    if (g.stage === 'boom') {
      const paid = !!me && g.out.indexOf(me.id) !== -1;
      pad.dataset.stage = paid ? 'out' : 'boom';
      padText.textContent = paid ? '¡Te tocó pagar!' : '¡Se acabó el tiempo!';
      padSub.textContent = 'Pagan: ' + firstNames(state, g.out);
      targets.textContent = '';
    } else if (holding) {
      pad.dataset.stage = 'hot';
      padText.textContent = '¡Tienes la cuenta!';
      padSub.textContent = '¿A quién se la pasas?';
      renderTargets(state, me);
    } else {
      targets.textContent = '';
      pad.dataset.stage = me && !me.alive ? 'out' : 'safe';
      padText.textContent = me && !me.alive ? 'Ya pagaste' : 'A salvo… por ahora';
      padSub.textContent = 'La tiene: ' + firstNames(state, g.holders);
    }
  }
})();
