(function () {
  const LANES = 5; // leaders shown, with your own lane always among them
  const SPRITES = '../../../assets/juegos/sprites/';
  const run = document.getElementById('run');
  const jump = document.getElementById('jump');
  const you = document.getElementById('you');
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  const faces = {};
  Object.keys(Juegos.CHARACTERS).forEach(function (name) {
    faces[name] = new Image();
    faces[name].src = Juegos.CHARACTERS[name].src;
  });
  const cake = Juegos.sprite(SPRITES + 'torta.svg', 22);
  const altar = Juegos.sprite(SPRITES + 'arco.svg', 34);

  let W = 0;
  let H = 0;
  let state = null;
  let myId = '';
  let sentLook = false;
  const shown = {}; // guest id -> progress as drawn, eased toward the server's

  const sala = Sala.open({ game: 'carrera-al-altar', render: render });

  sala.tapper(run, function () {
    run.classList.remove('is-hit');
    void run.offsetWidth; // restart the press animation
    run.classList.add('is-hit');
    if (navigator.vibrate) navigator.vibrate(8);
  });

  jump.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (!state || state.phase !== 'playing') return;
    sala.send({ t: 'jump' });
    Juegos.sfx('flap');
    jump.classList.remove('is-hit');
    void jump.offsetWidth;
    jump.classList.add('is-hit');
  });

  document.querySelectorAll('[data-look] button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sala.send({ t: 'look', who: btn.dataset.who });
      Juegos.sfx('flip');
    });
  });

  function resize() {
    const rect = canvas.parentNode.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ranked() {
    return state.players.slice().sort(function (a, b) {
      return (a.place || 999) - (b.place || 999) || (b.p || 0) - (a.p || 0);
    });
  }

  function render(next, me) {
    state = next;
    myId = me ? me.id : '';
    // Run as whoever you picked in the single-player games, unless you change it here
    if (me && !sentLook) {
      sentLook = true;
      if (me.look !== Juegos.player()) sala.send({ t: 'look', who: Juegos.player() });
    }
    document.querySelectorAll('[data-look] button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(!!me && me.look === btn.dataset.who));
    });

    const playing = next.phase === 'playing';
    const done = !!(me && me.place);
    run.disabled = !playing || done || !!(me && me.stun);
    jump.disabled = !playing || done;
    // The jump button calls for attention when a cake is coming up
    const hurdles = next.g.hurdles || [];
    const ahead = me ? hurdles.find(function (h) {
      return h > me.p;
    }) : undefined;
    jump.classList.toggle('is-urgent', playing && !done && ahead !== undefined && ahead - me.p <= 9);

    const order = ranked();
    const mine = order.findIndex(function (p) {
      return p.id === myId;
    });
    you.textContent = !me ? ''
      : me.place ? '¡Llegaste de ' + me.place + '.º!'
        : me.stun ? '¡Te tropezaste con la torta!'
          : playing ? 'Vas de ' + (mine + 1) + '.º de ' + order.length : '';
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    if (state) {
      const order = ranked();
      let lanes = order.slice(0, LANES);
      const mine = order.findIndex(function (p) {
        return p.id === myId;
      });
      if (mine >= LANES) lanes = order.slice(0, LANES - 1).concat(order[mine]);

      const goal = state.g.goal || 100;
      const laneH = Math.min(74, H / Math.max(3, lanes.length));
      const headH = Math.max(18, Math.min(26, laneH * 0.36));
      const x0 = 26;
      const x1 = W - 40;

      lanes.forEach(function (p, i) {
        const base = (i + 1) * laneH - 8;
        const isMe = p.id === myId;
        shown[p.id] = (shown[p.id] === undefined ? p.p : shown[p.id]) + ((p.p || 0) - (shown[p.id] || 0)) * 0.25;
        const x = x0 + (x1 - x0) * Math.min(1, shown[p.id] / goal);

        // Aisle
        ctx.fillStyle = isMe ? 'rgba(171, 88, 35, .16)' : 'rgba(184, 160, 136, .22)';
        ctx.fillRect(x0 - 12, base - 2, x1 - x0 + 30, 6);
        ctx.fillStyle = '#5d101f';
        ctx.fillRect(x0 - 12, base - 2, x1 - x0 + 30, 1.5);

        (state.g.hurdles || []).forEach(function (h) {
          Juegos.drawSprite(ctx, cake, x0 + (x1 - x0) * h / goal, base - 12);
        });
        Juegos.drawSprite(ctx, altar, x1 + 16, base - 18);

        // Name and place
        ctx.font = (isMe ? '600 ' : '400 ') + '11px Montserrat, sans-serif';
        ctx.fillStyle = isMe ? '#5d101f' : '#5c544d';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const pos = order.indexOf(p) + 1;
        ctx.fillText(pos + '. ' + p.name.split(' ')[0] + (p.place ? ' · llegó' : ''), x0 - 12, base - laneH + 20);

        // Runner: strides with every step, flies over a jump, flat on the floor after a cake
        const stride = Math.sin(shown[p.id] * 1.1);
        ctx.save();
        if (p.stun) ctx.globalAlpha = 0.55 + Math.sin(time / 60) * 0.25;
        Juegos.drawFigure(ctx, {
          who: p.look === 'cami' ? 'cami' : 'sebas',
          face: faces[p.look === 'cami' ? 'cami' : 'sebas'],
          x: x,
          feetY: base - (p.air && !p.stun ? 14 : 0),
          headH: headH,
          tilt: p.stun ? 1.25 : 0.12,
          legs: p.air ? [0.8, -0.6] : [stride * 0.8, -stride * 0.8],
          arms: p.place ? [-1.2, -1.2] : p.air ? [-0.7, -0.5] : [1.1 - stride * 0.7, 1.1 + stride * 0.7]
        });
        ctx.restore();
      });
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
