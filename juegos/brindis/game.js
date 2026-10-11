(function () {
  const GAME = 'brindis';
  const SPRITES = '../../assets/juegos/sprites/';
  const SHOTS = 15;
  const GLASSES = 5;
  const GRAVITY = 1400;
  const MAX_PULL = 120;
  const POWER = 11.5; // launch speed per pixel of pull
  const GLASS_POINTS = 2;
  const GOLD_POINTS = 5;
  const TRAY_BONUS = 5;
  const CAKE_PENALTY = 3;
  const CAKE_FROM_SHOT = 4;
  const BUBBLES = ['#e3b04b', '#f0d9a6', '#fbf8f3'];
  const HEAD_H = 44;

  const VERDICTS = [
    { min: 0, text: 'Brindaste con agua.' },
    { min: 12, text: 'Un brindis tímido, pero brindis al fin.' },
    { min: 30, text: '¡Salud! Los novios están felices.' },
    { min: 55, text: 'El alma del brindis.' },
    { min: 85, text: 'Descorchaste toda la reserva.' }
  ];

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const shotsEl = document.getElementById('shots');
  const hintEl = document.getElementById('hint');
  const startPanel = document.getElementById('startPanel');
  const overPanel = document.getElementById('overPanel');

  const faces = {};
  Object.keys(Juegos.CHARACTERS).forEach(function (name) {
    faces[name] = new Image();
    faces[name].src = Juegos.CHARACTERS[name].src;
    faces[name].addEventListener('load', function () {
      draw();
    });
  });
  const sprites = {
    glass: Juegos.sprite(SPRITES + 'copa.svg', 50),
    gold: Juegos.sprite(SPRITES + 'copa-dorada.svg', 54),
    cork: Juegos.sprite(SPRITES + 'corcho.svg', 34),
    cake: Juegos.sprite(SPRITES + 'torta.svg', 80)
  };
  const fx = Juegos.fx();

  let W = 0;
  let H = 0;
  let state = 'ready';
  let score = 0;
  let shotsLeft = SHOTS;
  let streak = 0;
  let clock = 0;
  let lastTime = 0;
  let cork = null; // the flying cork
  let drag = null; // { startX, startY, pullX, pullY }
  let endIn = 0;
  let refillIn = 0;
  let cheerFor = 0; // seconds the couple keeps celebrating
  let sadFor = 0;

  // A waiter's tray of glasses sliding side to side; each glass is filled once
  const tray = { x: 0, y: 0, dir: 1, glasses: [] };
  const cake = { x: 0, y: 0, dir: -1, wobble: 0, active: false };
  const sling = { x: 0, y: 0 };

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sling.x = W / 2;
    sling.y = H - 92;
    if (!tray.x) tray.x = W / 2;
    if (!cake.x) cake.x = W * 0.3;
    tray.y = H * 0.2;
    cake.y = H * 0.43;
    draw();
  }

  function spacing() {
    return Math.min(62, W * 0.135);
  }

  function shotsFired() {
    return SHOTS - shotsLeft;
  }

  function renderShots() {
    shotsEl.textContent = shotsLeft + (shotsLeft === 1 ? ' corcho' : ' corchos');
  }

  function addScore(points) {
    score = Math.max(0, score + points);
    scoreEl.textContent = score;
    scoreEl.classList.remove('is-bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('is-bump');
  }

  function fillTray() {
    const gold = Math.floor(Math.random() * GLASSES);
    tray.glasses = [];
    for (let i = 0; i < GLASSES; i++) {
      tray.glasses.push({ slot: i - (GLASSES - 1) / 2, full: false, gold: i === gold });
    }
  }

  function start() {
    score = 0;
    shotsLeft = SHOTS;
    streak = 0;
    clock = 0;
    cork = null;
    drag = null;
    endIn = refillIn = cheerFor = sadFor = 0;
    fx.clear();
    fillTray();
    tray.x = W / 2;
    cake.x = W * 0.3;
    cake.active = false;
    cake.wobble = 0;
    scoreEl.textContent = '0';
    renderShots();
    startPanel.hidden = true;
    overPanel.hidden = true;
    hintEl.hidden = false;
    state = 'playing';
    lastTime = 0;
    Juegos.sfx('go');
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = 'over';
    Juegos.finish({
      game: GAME,
      score: score,
      title: score === 1 ? 'Punto' : 'Puntos',
      verdict: Juegos.verdict(VERDICTS, score)
    });
  }

  function stagePoint(e) {
    const rect = stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pointerDown(e) {
    if (state !== 'playing' || cork || shotsLeft <= 0) return;
    const p = stagePoint(e);
    drag = { startX: p.x, startY: p.y, pullX: 0, pullY: 0 };
    hintEl.hidden = true;
  }

  function pointerMove(e) {
    if (!drag) return;
    const p = stagePoint(e);
    let dx = p.x - drag.startX;
    let dy = p.y - drag.startY;
    const length = Math.hypot(dx, dy);
    if (length > MAX_PULL) {
      dx *= MAX_PULL / length;
      dy *= MAX_PULL / length;
    }
    // Only pulling back (down) loads the sling
    drag.pullX = dx;
    drag.pullY = Math.max(0, dy);
  }

  function pointerUp() {
    if (!drag) return;
    const pull = Math.hypot(drag.pullX, drag.pullY);
    if (pull > 14) {
      cork = {
        x: sling.x + drag.pullX,
        y: sling.y + drag.pullY,
        vx: -drag.pullX * POWER,
        vy: -drag.pullY * POWER,
        rot: 0
      };
      shotsLeft--;
      renderShots();
      Juegos.sfx('flap');
    }
    drag = null;
  }

  function resolveShot() {
    cork = null;
    if (shotsLeft <= 0) endIn = 1.2;
  }

  function glassX(glass) {
    return tray.x + glass.slot * spacing();
  }

  function update(dt) {
    clock += dt;
    const fired = shotsFired();
    cheerFor = Math.max(0, cheerFor - dt);
    sadFor = Math.max(0, sadFor - dt);
    cake.wobble = Math.max(0, cake.wobble - dt);

    // The tray gets quicker with every cork
    const half = spacing() * (GLASSES - 1) / 2 + 26;
    tray.x += tray.dir * W * (0.13 + 0.022 * fired) * dt;
    if (tray.x > W - half) tray.dir = -1;
    if (tray.x < half) tray.dir = 1;

    cake.active = fired >= CAKE_FROM_SHOT;
    if (cake.active) {
      cake.x += cake.dir * W * 0.18 * dt;
      if (cake.x > W - 56) cake.dir = -1;
      if (cake.x < 56) cake.dir = 1;
    }

    if (refillIn > 0) {
      refillIn -= dt;
      if (refillIn <= 0) fillTray();
    }

    if (cork) {
      cork.vy += GRAVITY * dt;
      cork.x += cork.vx * dt;
      cork.y += cork.vy * dt;
      cork.rot += 9 * dt;

      const onCake = cake.active &&
        Math.pow((cork.x - cake.x) / 34, 2) + Math.pow((cork.y - cake.y) / 34, 2) < 1;
      const glass = !onCake && tray.glasses.find(function (g) {
        return !g.full && Math.hypot(cork.x - glassX(g), cork.y - tray.y) < 25;
      });

      if (onCake) {
        streak = 0;
        cake.wobble = 0.5;
        sadFor = 1.2;
        addScore(-CAKE_PENALTY);
        fx.label('¡La torta no! −' + CAKE_PENALTY, cake.x, cake.y - 62, '#5d101f', 20);
        fx.burst(cork.x, cork.y, ['#fbf8f3', '#c58b78', '#5d101f'], 12, 190);
        Juegos.sfx('bad');
        Juegos.shake(stage);
        resolveShot();
      } else if (glass) {
        glass.full = true;
        const gained = (glass.gold ? GOLD_POINTS : GLASS_POINTS) + streak;
        streak++;
        cheerFor = 1.1;
        addScore(gained);
        fx.label((glass.gold ? '¡Copa dorada! +' : '¡Salud! +') + gained, glassX(glass), tray.y - 46,
          glass.gold ? '#ab5823' : '#4b584f', glass.gold ? 24 : 20);
        fx.burst(glassX(glass), tray.y - 10, BUBBLES, glass.gold ? 18 : 10, 190);
        Juegos.sfx(glass.gold ? 'bonus' : 'match');
        if (navigator.vibrate) navigator.vibrate(30);
        if (tray.glasses.every(function (g) {
          return g.full;
        })) {
          addScore(TRAY_BONUS);
          fx.label('¡Bandeja completa! +' + TRAY_BONUS, W / 2, tray.y + 62, '#5d101f', 22);
          Juegos.sfx('win');
          cheerFor = 2;
          refillIn = 0.9;
        }
        resolveShot();
      } else if (cork.y > H + 40 || cork.x < -60 || cork.x > W + 60) {
        streak = 0;
        fx.label('¡Al aire!', Math.max(60, Math.min(W - 60, cork.x)), H * 0.58, '#5d101f', 16);
        Juegos.sfx('miss');
        resolveShot();
      }
    }

    if (endIn > 0) {
      endIn -= dt;
      if (endIn <= 0) gameOver();
    }
  }

  function drawTray() {
    const half = spacing() * (GLASSES - 1) / 2 + 30;
    ctx.fillStyle = '#b8a088';
    ctx.beginPath();
    ctx.ellipse(tray.x, tray.y + 27, half, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d9cdbd';
    ctx.beginPath();
    ctx.ellipse(tray.x, tray.y + 25, half - 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const glass of tray.glasses) {
      if (glass.full) {
        // A served glass leaves the tray; a faint ring marks its spot
        ctx.strokeStyle = 'rgba(93, 16, 31, .18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(glassX(glass), tray.y + 24, 9, 2.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      Juegos.drawSprite(ctx, glass.gold ? sprites.gold : sprites.glass, glassX(glass), tray.y);
    }
  }

  function drawCake() {
    const lean = Math.sin(cake.wobble * 30) * cake.wobble * 0.35;
    // Cart
    ctx.fillStyle = '#b8a088';
    ctx.fillRect(cake.x - 50, cake.y + 40, 100, 6);
    ctx.fillStyle = '#5c544d';
    ctx.beginPath();
    ctx.arc(cake.x - 34, cake.y + 52, 6, 0, Math.PI * 2);
    ctx.arc(cake.x + 34, cake.y + 52, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cake.x, cake.y + 40);
    ctx.rotate(lean);
    Juegos.drawSprite(ctx, sprites.cake, 0, -36);
    ctx.restore();
  }

  // Sebas and Cami toast from the sides: arms up when you score, slumped if you hit the cake
  function drawCouple() {
    const wave = Math.sin(clock * 14) * 0.25;
    [['sebas', 0.13, -1], ['cami', 0.87, 1]].forEach(function (c) {
      const cheering = cheerFor > 0;
      const sad = !cheering && sadFor > 0;
      const up = cheering ? -1.25 + wave : sad ? 1.35 : 0.6;
      Juegos.drawFigure(ctx, {
        who: c[0],
        face: faces[c[0]],
        x: W * c[1],
        feetY: H - 40 - (cheering ? Math.abs(Math.sin(clock * 12)) * 8 : 0),
        headH: HEAD_H,
        tilt: sad ? c[2] * 0.12 : 0,
        arms: [up, up - (cheering ? wave * 2 : 0)]
      });
    });
  }

  function drawSling() {
    const loaded = drag && Math.hypot(drag.pullX, drag.pullY) > 2;
    const cx = sling.x + (loaded ? drag.pullX : 0);
    const cy = sling.y + (loaded ? drag.pullY : 0);

    // Fork
    ctx.strokeStyle = '#8f7a63';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sling.x, H);
    ctx.lineTo(sling.x, sling.y + 34);
    ctx.moveTo(sling.x - 26, sling.y - 6);
    ctx.quadraticCurveTo(sling.x - 24, sling.y + 28, sling.x, sling.y + 34);
    ctx.quadraticCurveTo(sling.x + 24, sling.y + 28, sling.x + 26, sling.y - 6);
    ctx.stroke();

    if (!cork && shotsLeft > 0 && state === 'playing') {
      // Rubber bands
      ctx.strokeStyle = '#5d101f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sling.x - 26, sling.y - 6);
      ctx.lineTo(cx, cy);
      ctx.lineTo(sling.x + 26, sling.y - 6);
      ctx.stroke();

      if (loaded) {
        // Dotted preview of the first stretch of the flight
        const vx = -drag.pullX * POWER;
        const vy = -drag.pullY * POWER;
        ctx.fillStyle = 'rgba(93, 16, 31, .45)';
        for (let i = 1; i <= 9; i++) {
          const t = i * 0.055;
          ctx.beginPath();
          ctx.arc(cx + vx * t, cy + vy * t + 0.5 * GRAVITY * t * t, 4 - i * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      Juegos.drawSprite(ctx, sprites.cork, cx, cy);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Head table
    ctx.fillStyle = '#e8dfd3';
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = '#b8a088';
    ctx.fillRect(0, H - 40, W, 4);

    drawTray();
    if (cake.active) drawCake();
    drawCouple();
    drawSling();

    if (cork) {
      ctx.save();
      ctx.translate(cork.x, cork.y);
      ctx.rotate(cork.rot);
      Juegos.drawSprite(ctx, sprites.cork, 0, 0);
      ctx.restore();
    }
    fx.draw(ctx);
  }

  function loop(now) {
    if (state !== 'playing') {
      draw();
      return;
    }
    // Clamp so a backgrounded tab doesn't resume with one huge step
    const dt = lastTime ? Math.min(0.034, (now - lastTime) / 1000) : 0;
    lastTime = now;
    update(dt);
    fx.update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  stage.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', function () {
    drag = null;
  });

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Hice ' + score + (score === 1 ? ' punto' : ' puntos') +
      ' en el brindis de la boda de Cami & Sebas. ¿Me superas?');
  });

  window.addEventListener('resize', resize);
  fillTray();
  renderShots();
  resize();
})();
