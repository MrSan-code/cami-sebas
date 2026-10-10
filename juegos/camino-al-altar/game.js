(function () {
  const GAME = 'camino-al-altar';
  const SPRITES = '../../assets/juegos/sprites/';
  const FLOWERS = ['#5d101f', '#ab5823', '#c58b78', '#fbf8f3'];
  const GOLD = ['#c39a52', '#f0d9a6', '#fbf8f3'];
  const RING_POINTS = 3;

  const VERDICTS = [
    { min: 0, text: 'Llegaste tarde a tu propia boda.' },
    { min: 5, text: 'Casi, casi. Cami ya estaba mirando el reloj.' },
    { min: 15, text: 'Llegaste justo a tiempo.' },
    { min: 30, text: 'Cami ni alcanzó a preocuparse.' },
    { min: 55, text: 'Llegaste antes que los invitados.' }
  ];

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const toastEl = document.getElementById('toast');
  const hintEl = document.getElementById('hint');
  const startPanel = document.getElementById('startPanel');
  const overPanel = document.getElementById('overPanel');

  const face = new Image();
  face.src = '../../assets/juegos/sebas.webp';
  const ringSprite = Juegos.sprite(SPRITES + 'anillo.svg', 34);
  const fx = Juegos.fx();

  let W = 0;
  let H = 0;
  // ready -> hover (waiting for the first tap) -> playing -> dying -> over
  let state = 'ready';
  let score = 0;
  let passed = 0;
  let arches = [];
  let rings = [];
  let lastTime = 0;
  let travelled = 0;
  let clock = 0;
  let dyingFor = 0;

  const FLOOR = 18;
  const ARCH_W = 54;
  const player = { x: 0, y: 0, vy: 0, h: 58, w: 43, r: 20, rot: 0 };

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.h = Math.max(48, Math.min(62, H * 0.085));
    player.w = player.h * (235 / 320);
    player.r = player.h * 0.34;
    player.x = W * 0.28;
    if (state !== 'playing' && state !== 'dying') player.y = H * 0.42;
    draw();
  }

  // 0 at the start, 1 once the game is at full speed
  function difficulty() {
    return Math.min(1, passed / 40);
  }

  function spacing() {
    return W * 0.66;
  }

  function renderBest() {
    const best = Juegos.getBest(GAME);
    bestEl.textContent = best ? 'Récord ' + best : '';
  }

  function addScore(points) {
    score += points;
    scoreEl.textContent = score;
    scoreEl.classList.remove('is-bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('is-bump');
  }

  function addArch(x) {
    const gap = H * (0.3 - 0.07 * difficulty());
    const margin = H * 0.1;
    let top = margin + Math.random() * (H - FLOOR - gap - margin * 2);
    // Keep consecutive gaps reachable at full speed
    const prev = arches[arches.length - 1];
    if (prev) top = Math.max(prev.top - H * 0.26, Math.min(prev.top + H * 0.26, top));
    const arch = { x: x, top: top, bottom: top + gap, passed: false };
    arches.push(arch);

    // Sometimes a ring floats halfway to this arch, a bit off the easy line
    if (prev && Math.random() < 0.4) {
      const midY = ((prev.top + prev.bottom) / 2 + (arch.top + arch.bottom) / 2) / 2;
      const offset = (Math.random() < 0.5 ? -1 : 1) * H * (0.05 + Math.random() * 0.05);
      rings.push({
        x: x - spacing() / 2 + ARCH_W / 2,
        y: Math.max(H * 0.12, Math.min(H - FLOOR - H * 0.12, midY + offset)),
        phase: Math.random() * 6
      });
    }
  }

  function start() {
    score = 0;
    passed = 0;
    arches = [];
    rings = [];
    fx.clear();
    player.y = H * 0.42;
    player.vy = 0;
    player.rot = 0;
    scoreEl.textContent = '0';
    renderBest();
    addArch(W * 1.25);
    startPanel.hidden = true;
    overPanel.hidden = true;
    toastEl.hidden = true;
    hintEl.hidden = false;
    state = 'hover';
    lastTime = 0;
    requestAnimationFrame(loop);
  }

  function tap() {
    if (state === 'hover') {
      state = 'playing';
      hintEl.hidden = true;
    }
    if (state !== 'playing') return;
    player.vy = -H * 0.7;
    Juegos.sfx('flap');
    fx.burst(player.x - player.w * 0.3, player.y + player.h * 0.3, FLOWERS, 3, 90);
  }

  function crash() {
    state = 'dying';
    dyingFor = 0;
    player.vy = -H * 0.45;
    Juegos.sfx('bad');
    Juegos.shake(stage);
    fx.burst(player.x, player.y, FLOWERS, 14, 220);
  }

  function gameOver() {
    state = 'over';
    Juegos.finish({
      game: GAME,
      score: score,
      title: score === 1 ? 'Punto' : 'Puntos',
      verdict: Juegos.verdict(VERDICTS, score)
    });
    renderBest();
  }

  function hitsRect(rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(player.x, rx + rw));
    const ny = Math.max(ry, Math.min(player.y, ry + rh));
    const dx = player.x - nx;
    const dy = player.y - ny;
    return dx * dx + dy * dy < player.r * player.r;
  }

  function update(dt) {
    const speed = W * (0.5 + 0.28 * difficulty());
    travelled += speed * dt;

    player.vy += H * 2.5 * dt;
    player.y += player.vy * dt;
    player.rot = Math.max(-0.45, Math.min(0.9, player.vy / (H * 1.4)));
    if (player.y < player.r) {
      player.y = player.r;
      player.vy = 0;
    }

    for (const a of arches) a.x -= speed * dt;
    for (const r of rings) r.x -= speed * dt;
    if (arches.length && arches[0].x + ARCH_W < -30) arches.shift();
    if (rings.length && rings[0].x < -30) rings.shift();
    const last = arches[arches.length - 1];
    if (last.x < W - spacing()) addArch(last.x + spacing());

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const dx = r.x - player.x;
      const dy = r.y - player.y;
      if (dx * dx + dy * dy < Math.pow(player.r + 15, 2)) {
        rings.splice(i, 1);
        addScore(RING_POINTS);
        fx.label('+' + RING_POINTS, r.x, r.y - 18, '#ab5823', 24);
        fx.burst(r.x, r.y, GOLD, 12, 170);
        Juegos.sfx('bonus');
      }
    }

    for (const a of arches) {
      if (!a.passed && a.x + ARCH_W < player.x - player.r) {
        a.passed = true;
        passed++;
        addScore(1);
        Juegos.sfx('pick');
        if (passed % 10 === 0) Juegos.toast(toastEl, '¡' + passed + ' arcos!');
      }
      if (hitsRect(a.x, -H, ARCH_W, H + a.top) || hitsRect(a.x, a.bottom, ARCH_W, H)) {
        crash();
        return;
      }
    }

    if (player.y + player.r > H - FLOOR) {
      player.y = H - FLOOR - player.r;
      crash();
    }
  }

  // Sebas tumbles off the screen before the result shows
  function updateDying(dt) {
    dyingFor += dt;
    player.vy += H * 2.5 * dt;
    player.y += player.vy * dt;
    player.rot += 9 * dt;
    if (dyingFor > 0.85 || player.y > H + player.h) gameOver();
  }

  function hill(x, base, amp, f1, f2) {
    return H * base - amp * (Math.sin(x * f1) + 0.5 * Math.sin(x * f2 + 1.3));
  }

  function drawHills(shift, base, amp, f1, f2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 12; x += 12) {
      ctx.lineTo(x, hill(x + shift, base, amp, f1, f2));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawGarland(cx, cy) {
    ctx.fillStyle = '#707f75';
    ctx.beginPath();
    ctx.ellipse(cx - 27, cy + 2, 9, 4, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + 27, cy + 2, 9, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    const spots = [[-19, 2, 10, 0], [0, -2, 12, 1], [19, 2, 10, 2], [-9, 8, 7, 3], [10, 8, 7, 0]];
    for (const s of spots) {
      ctx.fillStyle = FLOWERS[s[3]];
      ctx.beginPath();
      ctx.arc(cx + s[0], cy + s[1], s[2], 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(47, 42, 38, .16)';
      ctx.beginPath();
      ctx.arc(cx + s[0], cy + s[1], s[2] * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Stone column; `capAtTop` says which end faces the gap
  function drawColumn(x, y, h, capAtTop) {
    ctx.fillStyle = '#e8dfd3';
    ctx.fillRect(x + 6, y, ARCH_W - 12, h);
    ctx.fillStyle = '#d2c5b4';
    ctx.fillRect(x + ARCH_W - 18, y, 12, h);
    ctx.fillStyle = 'rgba(251, 248, 243, .7)';
    ctx.fillRect(x + 11, y, 4, h);
    ctx.fillStyle = '#c8b9a6';
    ctx.fillRect(x, capAtTop ? y : y + h - 12, ARCH_W, 12);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Sunset behind the hills
    const sunX = W * 0.74;
    const sunY = H * 0.3;
    ctx.fillStyle = 'rgba(197, 139, 120, .16)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(197, 139, 120, .3)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 48, 0, Math.PI * 2);
    ctx.fill();

    drawHills(travelled * 0.12, 0.74, 26, 0.011, 0.023, '#d3d9d2');
    drawHills(travelled * 0.3 + 400, 0.86, 22, 0.016, 0.031, '#b4bfb5');

    for (const r of rings) {
      Juegos.drawSprite(ctx, ringSprite, r.x, r.y + Math.sin(clock * 4 + r.phase) * 4);
    }

    for (const a of arches) {
      drawColumn(a.x, 0, a.top, false);
      drawColumn(a.x, a.bottom, H - FLOOR - a.bottom, true);
      drawGarland(a.x + ARCH_W / 2, a.top - 2);
      drawGarland(a.x + ARCH_W / 2, a.bottom + 2);
    }

    // Aisle runner with moving dashes so speed is readable
    ctx.fillStyle = '#b8a088';
    ctx.fillRect(0, H - FLOOR, W, FLOOR);
    ctx.fillStyle = '#5d101f';
    ctx.fillRect(0, H - FLOOR, W, 3);
    ctx.fillStyle = 'rgba(251, 248, 243, .6)';
    for (let x = -(travelled % 36); x < W; x += 36) {
      ctx.fillRect(x, H - FLOOR + 9, 18, 3);
    }

    if (face.complete && face.naturalWidth) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.rot);
      ctx.drawImage(face, -player.w / 2, -player.h / 2, player.w, player.h);
      ctx.restore();
    }

    fx.draw(ctx);
  }

  function loop(now) {
    if (state === 'ready' || state === 'over') {
      draw();
      return;
    }
    // Clamp so a backgrounded tab doesn't resume with one huge step
    const dt = lastTime ? Math.min(0.034, (now - lastTime) / 1000) : 0;
    lastTime = now;
    clock += dt;

    if (state === 'hover') {
      travelled += W * 0.25 * dt;
      player.y = H * 0.42 + Math.sin(clock * 4) * 8;
      player.rot = 0;
    } else if (state === 'playing') {
      update(dt);
    } else if (state === 'dying') {
      updateDying(dt);
    }
    fx.update(dt);
    draw();
    if (state !== 'over') requestAnimationFrame(loop);
  }

  stage.addEventListener('pointerdown', tap);
  window.addEventListener('keydown', function (e) {
    if (e.repeat || (state !== 'hover' && state !== 'playing')) return;
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      tap();
    }
  });

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Hice ' + score + (score === 1 ? ' punto' : ' puntos') +
      ' camino al altar en la boda de Cami & Sebas. ¿Me superas?');
  });

  window.addEventListener('resize', resize);
  face.addEventListener('load', draw);
  renderBest();
  resize();
})();
