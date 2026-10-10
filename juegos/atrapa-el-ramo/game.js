(function () {
  const GAME = 'atrapa-el-ramo';
  const MAX_LIVES = 3;
  const MAX_MULT = 4;
  const STREAK_STEP = 5; // catches in a row per multiplier level
  const HEART_WAIT = 22; // seconds after losing a life before a heart may appear
  const HEART_CHANCE = 0.1; // per spawn, once the wait is over
  const SPRITES = '../../assets/juegos/sprites/';
  const PETALS = ['#5d101f', '#ab5823', '#c58b78', '#e0d6cb'];
  const GOLD = ['#c39a52', '#f0d9a6', '#fbf8f3'];

  const ITEMS = {
    ramo: { size: 58, points: 1 },
    anillo: { size: 46, points: 5 },
    tormenta: { size: 58, points: 0 },
    corazon: { size: 34, points: 3 }
  };

  const VERDICTS = [
    { min: 0, text: 'Cami se quedó sin ramo.' },
    { min: 25, text: 'Buen brazo. Vas calentando.' },
    { min: 70, text: 'Cami ya te quiere en su equipo.' },
    { min: 150, text: 'Nadie atrapa ramos como tú.' },
    { min: 300, text: 'Leyenda de las bodas. El ramo es tuyo.' }
  ];

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const comboEl = document.getElementById('combo');
  const startPanel = document.getElementById('startPanel');
  const overPanel = document.getElementById('overPanel');

  const face = new Image();
  face.src = '../../assets/juegos/cami.webp';
  const sprites = {};
  Object.keys(ITEMS).forEach(function (name) {
    sprites[name] = Juegos.sprite(SPRITES + name + '.svg?v=2', ITEMS[name].size);
  });
  const fx = Juegos.fx();

  let W = 0;
  let H = 0;
  let state = 'ready';
  let score = 0;
  let lives = MAX_LIVES;
  let streak = 0;
  let clock = 0;
  let items = [];
  let bokeh = [];
  let spawnIn = 0;
  let heartIn = 0;
  let lastTime = 0;
  let keyDir = 0;

  const FLOOR = 16;
  const player = { x: 0, targetX: 0, w: 78, h: 85, squash: 0, hurt: 0 };

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.w = Math.max(64, Math.min(86, W * 0.2));
    player.h = player.w * (320 / 293);
    player.x = clampX(player.x || W / 2);
    player.targetX = clampX(player.targetX || W / 2);
    bokeh = [];
    for (let i = 0; i < 7; i++) {
      bokeh.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.8,
        r: 18 + Math.random() * 34,
        vx: (Math.random() - 0.5) * 8,
        color: PETALS[1 + (i % 3)]
      });
    }
    draw();
  }

  function clampX(x) {
    return Math.max(player.w / 2, Math.min(W - player.w / 2, x));
  }

  // 0 at the start, 1 once the game is at full speed
  function difficulty() {
    return Math.min(1, Math.max(score / 110, clock / 80));
  }

  // Keeps tightening after full speed so long runs still end
  function overtime() {
    return Math.max(0, Math.min(1, (clock - 80) / 120));
  }

  function mult() {
    return Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_STEP));
  }

  function renderLives() {
    let html = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      html += '<span' + (i < lives ? '' : ' class="lost"') + '>♥</span>';
    }
    livesEl.innerHTML = html;
    livesEl.setAttribute('aria-label', 'Vidas: ' + lives);
  }

  function addScore(points) {
    score += points;
    scoreEl.textContent = score;
    scoreEl.classList.remove('is-bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('is-bump');
  }

  function setStreak(value) {
    const before = mult();
    streak = value;
    const now = mult();
    if (now === 1) {
      comboEl.hidden = true;
    } else if (now !== before) {
      Juegos.toast(comboEl, 'Racha x' + now);
      Juegos.sfx('bonus');
    }
  }

  function start() {
    score = 0;
    lives = MAX_LIVES;
    streak = 0;
    clock = 0;
    items = [];
    fx.clear();
    spawnIn = 0.6;
    heartIn = HEART_WAIT;
    player.x = player.targetX = W / 2;
    player.squash = player.hurt = 0;
    scoreEl.textContent = '0';
    comboEl.hidden = true;
    renderLives();
    startPanel.hidden = true;
    overPanel.hidden = true;
    state = 'playing';
    lastTime = 0;
    Juegos.sfx('go');
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = 'over';
    comboEl.hidden = true;
    Juegos.finish({
      game: GAME,
      score: score,
      title: score === 1 ? 'Punto' : 'Puntos',
      verdict: Juegos.verdict(VERDICTS, score)
    });
  }

  function spawn() {
    const t = difficulty();
    const roll = Math.random();
    let type = 'ramo';
    if (roll < 0.15 + 0.2 * t) type = 'tormenta';
    else if (roll > 0.94) type = 'anillo';
    else if (lives < MAX_LIVES && heartIn <= 0 && roll > 0.94 - HEART_CHANCE) {
      type = 'corazon';
      heartIn = HEART_WAIT * 1.5;
    }

    const size = ITEMS[type].size;
    // Hearts are a reward to chase: faster than everything else and zigzagging
    const rush = type === 'corazon' ? 1.45 : 1;
    const edge = type === 'corazon' ? 64 : size / 2 + 6; // keep the zigzag on screen
    const x = edge + Math.random() * (W - edge * 2);
    items.push({
      type: type,
      baseX: x,
      x: x,
      y: -size,
      r: size / 2,
      vy: H * (0.3 + 0.48 * t + 0.22 * overtime()) * (0.9 + Math.random() * 0.25) * rush,
      rot: 0,
      swing: type === 'tormenta' ? 0 : 0.22 + Math.random() * 0.12,
      sway: type === 'tormenta' ? 14 + Math.random() * 14 : type === 'corazon' ? 46 : 0,
      phase: Math.random() * 6
    });
    spawnIn = 0.95 - 0.55 * t - 0.1 * overtime();
  }

  function loseLife() {
    lives--;
    heartIn = HEART_WAIT;
    renderLives();
    setStreak(0);
    player.hurt = 0.9;
    Juegos.shake(stage);
    if (lives <= 0) gameOver();
  }

  function collect(it, top) {
    if (it.type === 'tormenta') {
      fx.label('¡Uy!', it.x, top - 6, '#5d101f');
      fx.burst(it.x, top + 10, ['#8a9aa3', '#5c544d'], 10, 190);
      Juegos.sfx('bad');
      loseLife();
      return;
    }
    player.squash = 0.18;
    if (it.type === 'corazon' && lives < MAX_LIVES) {
      lives++;
      renderLives();
      fx.label('+1 vida', it.x, top - 6, '#5d101f');
      fx.burst(it.x, top + 10, ['#5d101f', '#c58b78'], 12, 170);
      Juegos.sfx('bonus');
      return;
    }
    const gained = ITEMS[it.type].points * mult();
    addScore(gained);
    fx.label('+' + gained, it.x, top - 6, it.type === 'ramo' ? '#4b584f' : '#ab5823', it.type === 'ramo' ? 20 : 26);
    fx.burst(it.x, top + 10, it.type === 'ramo' ? PETALS : GOLD, it.type === 'ramo' ? 8 : 14, 170);
    Juegos.sfx(it.type === 'ramo' ? 'pick' : 'bonus');
    setStreak(streak + 1);
  }

  function update(dt) {
    clock += dt;
    heartIn -= dt;
    if (keyDir) player.targetX = clampX(player.targetX + keyDir * W * 1.3 * dt);
    player.x += (player.targetX - player.x) * Math.min(1, dt * 18);
    player.squash = Math.max(0, player.squash - dt);
    player.hurt = Math.max(0, player.hurt - dt);

    for (const b of bokeh) {
      b.x += b.vx * dt;
      if (b.x < -b.r) b.x = W + b.r;
      if (b.x > W + b.r) b.x = -b.r;
    }

    spawnIn -= dt;
    if (spawnIn <= 0) spawn();

    const top = H - FLOOR - player.h;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * dt;
      it.rot = Math.sin(clock * 3 + it.phase) * it.swing;
      if (it.sway) it.x = it.baseX + Math.sin(clock * (it.type === 'corazon' ? 5 : 2.4) + it.phase) * it.sway;

      const caught = it.y + it.r > top + 8 &&
        it.y < top + player.h * 0.6 &&
        Math.abs(it.x - player.x) < player.w / 2 + it.r * 0.35;

      if (caught) {
        items.splice(i, 1);
        collect(it, top);
      } else if (it.y - it.r > H - FLOOR) {
        items.splice(i, 1);
        if (it.type === 'ramo') {
          fx.burst(it.x, H - FLOOR, PETALS, 9, 130);
          fx.label('¡Se cayó!', it.x, H - FLOOR - 26, '#5d101f', 15);
          Juegos.sfx('miss');
          loseLife();
        }
      }
      if (state !== 'playing') return;
    }

    fx.update(dt);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Soft out-of-focus lights drifting in the background
    for (const b of bokeh) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Lawn
    ctx.fillStyle = '#8f9c92';
    ctx.fillRect(0, H - FLOOR, W, FLOOR);
    ctx.fillStyle = '#707f75';
    ctx.fillRect(0, H - FLOOR, W, 3);

    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      Juegos.drawSprite(ctx, sprites[it.type], 0, 0);
      ctx.restore();
    }

    // Shadow under Cami
    ctx.fillStyle = 'rgba(47, 42, 38, .18)';
    ctx.beginPath();
    ctx.ellipse(player.x, H - FLOOR + 3, player.w * 0.4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (face.complete && face.naturalWidth) {
      const tilt = Math.max(-0.28, Math.min(0.28, (player.targetX - player.x) * 0.012));
      const squash = Math.sin((player.squash / 0.18) * Math.PI) * 0.12;
      ctx.save();
      // Blink while hurt
      if (player.hurt > 0 && Math.floor(player.hurt * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      ctx.translate(player.x, H - FLOOR);
      ctx.rotate(tilt);
      ctx.scale(1 + squash, 1 - squash);
      ctx.drawImage(face, -player.w / 2, -player.h, player.w, player.h);
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
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function pointerMove(e) {
    if (state !== 'playing') return;
    player.targetX = clampX(e.clientX - stage.getBoundingClientRect().left);
  }

  stage.addEventListener('pointerdown', pointerMove);
  stage.addEventListener('pointermove', pointerMove);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') keyDir = -1;
    else if (e.key === 'ArrowRight') keyDir = 1;
  });
  window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' && keyDir === -1) keyDir = 0;
    else if (e.key === 'ArrowRight' && keyDir === 1) keyDir = 0;
  });

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Hice ' + score + (score === 1 ? ' punto' : ' puntos') +
      ' atrapando ramos en la boda de Cami & Sebas. ¿Me superas?');
  });

  window.addEventListener('resize', resize);
  face.addEventListener('load', draw);
  renderLives();
  resize();
})();
