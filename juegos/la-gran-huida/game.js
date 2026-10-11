(function () {
  const GAME = 'la-gran-huida';
  const SPRITES = '../../assets/juegos/sprites/';
  const PETALS = ['#5d101f', '#ab5823', '#c58b78', '#e0d6cb'];
  const GOLD = ['#c39a52', '#f0d9a6', '#fbf8f3'];
  const GRAVITY = 1800;
  const JUMP = 780;
  const DOUBLE_JUMP = 680;
  const BOUNCE = 1080; // launch speed off a trampoline
  const FLOOR = 26;
  const HEAD_H = 52;
  const LOW = 84; // height of the lower platforms above the ground
  const HIGH = 166; // and of the upper ones
  const CART_SPEED = 130; // how much faster than the scenery the cake cart comes at you
  const STAGE_SECONDS = 22;
  const BUBBLE_FONT = '600 13px Montserrat, sans-serif';
  const LINE_H = 17;

  // Things to grab on the way out. `points: 0` marks the bouquet, which is a shield instead.
  const ITEMS = {
    regalo: { size: 36, points: 2 },
    anillo: { size: 36, points: 5 },
    ramo: { size: 42, points: 0 }
  };

  // The escape goes through the whole party; each stage unlocks new things and repaints the hills
  const STAGES = [
    { name: 'La salida de la iglesia', hills: ['#d3d9d2', '#b4bfb5'] },
    { name: 'El coctel', hills: ['#e6d8cc', '#cfb9a8'] },
    { name: 'La pista de baile', hills: ['#dccbd0', '#b99ca5'] },
    { name: 'Rumbo a la luna de miel', hills: ['#d2d9de', '#a9b7c1'] }
  ];

  const QUESTIONS = [
    '¿Y los hijos para cuándo?',
    '¿Ya compraron casa?',
    '¿Y el segundo?',
    '¿Cuánto costó la boda?',
    '¿Y por qué no lo invitaste?',
    'En mis tiempos…',
    '¿Quién paga la luna de miel?',
    '¿Y ese peinado?',
    '¿Todavía en ese trabajo?',
    '¿Para cuándo el nieto?',
    '¿Ya sabes cocinar?',
    'Yo a tu edad ya tenía tres',
    '¿Y el perro también va?',
    '¿Me das tu WiFi?',
    'Estás igualito a tu papá',
    '¿Y cuándo nos visitan?',
    '¿Y la tía no baila?',
    '¿Quién manda en la casa?',
    '¿Te acuerdas de mí?',
    'Yo te cargué de bebé',
    'Cuando yo me casé…',
    '¿A qué hora sirven?',
    '¿Me guardas torta?',
    '¿Ensayaron el vals?',
    '¿Quién escogió esa canción?',
    '¿Dónde van a vivir?',
    '¿Quién lava los platos?',
    '¿Quién hizo el vestido?',
    '¿Ya te vas tan temprano?',
    '¿Puedo dar unas palabras?',
    '¿Y por qué no hay baile?',
    '¿Ya conoces a toda la familia?',
    '¿Y quién atrapó el ramo?'
  ];

  const VERDICTS = [
    { min: 0, text: 'No pasaste ni de la entrada.' },
    { min: 20, text: 'Sobreviviste al coctel.' },
    { min: 50, text: 'Esquivaste hasta a la tía abuela.' },
    { min: 100, text: 'Maestro de la evasión familiar.' },
    { min: 170, text: 'Ya vas camino a la luna de miel.' }
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

  const faces = {};
  Object.keys(Juegos.CHARACTERS).forEach(function (name) {
    faces[name] = new Image();
    faces[name].src = Juegos.CHARACTERS[name].src;
    faces[name].addEventListener('load', function () {
      draw();
    });
  });
  const sprites = { cart: Juegos.sprite(SPRITES + 'torta.svg', 58) };
  Object.keys(ITEMS).forEach(function (name) {
    sprites[name] = Juegos.sprite(SPRITES + name + '.svg' + (name === 'ramo' ? '?v=2' : ''), ITEMS[name].size);
  });
  const fx = Juegos.fx();
  let who = Juegos.player();

  let W = 0;
  let H = 0;
  // ready -> playing -> dying -> over
  let state = 'ready';
  let score = 0;
  let dodged = 0;
  let stageIndex = 0;
  // Everything in the world scrolls left; x is the left edge unless noted
  let obstacles = []; // questions and cake carts
  let platforms = [];
  let pits = [];
  let springs = [];
  let items = [];
  let shield = false;
  let safeFor = 0; // brief grace after the shield absorbs a hit
  let lastTime = 0;
  let travelled = 0;
  let clock = 0;
  let nextIn = 0; // pixels until the next group enters
  let dyingFor = 0;
  let endReason = '';
  let lastQuestion = -1;
  let lastPattern = '';

  // y is the height of the feet above the ground (negative while falling into a hole)
  const player = { x: 0, y: 0, vy: 0, jumps: 0, h: Juegos.figureHeight(who, HEAD_H), rot: 0 };

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.x = W * 0.22;
    draw();
  }

  // 0 at the start, 1 once the game is at full speed
  function difficulty() {
    return Math.min(1, clock / 75);
  }

  function speed() {
    // Keeps creeping up after full difficulty, so even a perfect run ends eventually
    return 300 + 190 * difficulty() + 70 * Math.min(1, Math.max(0, clock - 90) / 120);
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

  // ---- World pieces ----

  // Long questions wrap to two lines so the bubble stays jumpable
  function addBubble(x, floats) {
    let index;
    do {
      index = Math.floor(Math.random() * QUESTIONS.length);
    } while (index === lastQuestion);
    lastQuestion = index;
    const text = QUESTIONS[index];

    ctx.font = BUBBLE_FONT;
    let lines = [text];
    if (ctx.measureText(text).width > 100) {
      const words = text.split(' ');
      let best = 1;
      let bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    const bubble = {
      kind: 'bubble',
      text: text,
      lines: lines,
      x: x,
      w: Math.max.apply(null, lines.map(function (l) {
        return ctx.measureText(l).width;
      })) + 24,
      h: lines.length * LINE_H + 16,
      // Floating ones sit high enough to run under, low enough that a jump runs into them
      lift: floats ? player.h + 10 + Math.random() * 24 : 0,
      extra: 0,
      passed: false
    };
    obstacles.push(bubble);
    return bubble;
  }

  // The cake cart rolls toward you faster than everything else
  function addCart(x) {
    const cart = { kind: 'cart', x: x, w: 58, h: 50, lift: 0, extra: CART_SPEED, passed: false };
    obstacles.push(cart);
    return cart;
  }

  function addPlatform(x, width, height) {
    platforms.push({ x: x, w: width, h: height });
  }

  // y is the height of the item's centre above the ground
  function addItem(type, x, y) {
    items.push({ type: type, x: x, y: y, phase: Math.random() * 6 });
  }

  function addRow(type, x, width, count, y) {
    for (let i = 0; i < count; i++) {
      addItem(type, x + width * (i + 1) / (count + 1), y);
    }
  }

  // ---- Groups of obstacles. Each lays itself out from x and returns how long it is. ----
  const PATTERNS = {
    question: function (x) {
      return addBubble(x, false).w;
    },
    // Gifts along the arc of the jump over a question
    arc: function (x) {
      const bubble = addBubble(x, false);
      const centre = x + bubble.w / 2;
      addItem('regalo', centre - 58, 150);
      addItem('regalo', centre, 190);
      addItem('regalo', centre + 58, 150);
      return bubble.w;
    },
    floating: function (x) {
      return addBubble(x, true).w;
    },
    // A table with prizes on top; often a question waits underneath
    table: function (x) {
      const width = 170 + Math.random() * 60;
      addPlatform(x, width, LOW);
      addRow('regalo', x, width, width > 200 ? 3 : 2, LOW + 36);
      if (Math.random() < 0.65) addBubble(x + width * 0.38, false);
      return width;
    },
    // A hole in the dance floor, with gifts over the jump
    hole: function (x) {
      const width = 80 + Math.random() * 40;
      pits.push({ x: x, w: width, passed: false });
      addItem('regalo', x + width * 0.3, 140);
      addItem('regalo', x + width * 0.7, 140);
      return width;
    },
    // A wide hole with a table bridging it: the safe way is over the top
    bridge: function (x) {
      const width = 190 + Math.random() * 40;
      pits.push({ x: x + 50, w: width, passed: false });
      addPlatform(x, width + 100, LOW);
      addRow('regalo', x + 50, width, 3, LOW + 36);
      return width + 100;
    },
    // Two tables like steps, with rings on the top one and questions below
    stairs: function (x) {
      addPlatform(x, 150, LOW);
      addPlatform(x + 185, 170, HIGH);
      addItem('regalo', x + 75, LOW + 36);
      addRow('anillo', x + 185, 170, 2, HIGH + 36);
      addBubble(x + 215, false);
      return 355;
    },
    // A trampoline that throws you up through a line of prizes
    spring: function (x) {
      springs.push({ x: x + 20, squash: 0 });
      const v = speed();
      // Prizes sit where the bounce will carry the body
      [0.28, 0.6, 0.92].forEach(function (t, i) {
        addItem(i === 1 ? 'anillo' : 'regalo', x + 20 + v * t, BOUNCE * t - GRAVITY / 2 * t * t + player.h * 0.5);
      });
      return 40 + v * 1.2;
    },
    cart: function (x) {
      addCart(x + 60);
      return 120;
    },
    // Two questions close together: one long double jump, or two quick ones
    pair: function (x) {
      const first = addBubble(x, false);
      const second = addBubble(x + first.w + speed() * 0.78, false);
      return second.x + second.w - x;
    }
  };

  // What can show up in each stage, with weights
  const MENU = [
    [['question', 5], ['arc', 3], ['table', 3], ['hole', 2]],
    [['question', 3], ['arc', 2], ['table', 2], ['hole', 3], ['floating', 3], ['spring', 2], ['bridge', 2]],
    [['question', 2], ['arc', 2], ['hole', 3], ['floating', 2], ['spring', 2], ['bridge', 2], ['stairs', 3], ['cart', 3], ['pair', 2]],
    [['question', 1], ['arc', 2], ['hole', 3], ['floating', 2], ['spring', 2], ['bridge', 3], ['stairs', 3], ['cart', 3], ['pair', 3]]
  ];

  function spawnGroup() {
    const x = W + 30;
    let name = 'question';
    if (clock > 4) {
      // Weighted pick, never the same group twice in a row
      const menu = MENU[stageIndex].filter(function (entry) {
        return entry[0] !== lastPattern;
      });
      let roll = Math.random() * menu.reduce(function (sum, entry) {
        return sum + entry[1];
      }, 0);
      for (const entry of menu) {
        roll -= entry[1];
        if (roll <= 0) {
          name = entry[0];
          break;
        }
      }
    }
    lastPattern = name;
    let length = PATTERNS[name](x);

    // Now and then a bouquet: it shields you from one question or one cart
    if (!shield && Math.random() < 0.08) {
      addItem('ramo', x + length + 80, 60);
      length += 120;
    }
    nextIn = length + speed() * (1.0 + Math.random() * 0.5 - 0.2 * difficulty());
  }

  function start() {
    score = 0;
    dodged = 0;
    stageIndex = 0;
    clock = 0;
    obstacles = [];
    platforms = [];
    pits = [];
    springs = [];
    items = [];
    shield = false;
    safeFor = 0;
    lastPattern = '';
    fx.clear();
    who = Juegos.player();
    player.h = Juegos.figureHeight(who, HEAD_H);
    player.y = 0;
    player.vy = 0;
    player.jumps = 0;
    player.rot = 0;
    nextIn = 260;
    scoreEl.textContent = '0';
    renderBest();
    startPanel.hidden = true;
    overPanel.hidden = true;
    toastEl.hidden = true;
    hintEl.hidden = false;
    state = 'playing';
    lastTime = 0;
    Juegos.sfx('go');
    requestAnimationFrame(loop);
  }

  function jump() {
    if (state !== 'playing' || player.y < -4) return;
    hintEl.hidden = true;
    if (player.jumps >= 2) return;
    player.vy = player.jumps === 0 ? JUMP : DOUBLE_JUMP;
    player.jumps++;
    Juegos.sfx('flap');
    fx.burst(player.x, H - FLOOR - player.y, PETALS, 3, 80);
  }

  function crash(reason) {
    state = 'dying';
    dyingFor = 0;
    endReason = reason;
    Juegos.sfx('bad');
    Juegos.shake(stage);
  }

  function gameOver() {
    state = 'over';
    Juegos.finish({
      game: GAME,
      score: score,
      title: (score === 1 ? 'Punto' : 'Puntos') + ' · ' + STAGES[stageIndex].name,
      verdict: endReason + ' ' + Juegos.verdict(VERDICTS, score)
    });
    renderBest();
  }

  function collect(item) {
    const y = H - FLOOR - item.y;
    if (item.type === 'ramo') {
      shield = true;
      fx.label('¡Escudo!', item.x, y - 22, '#5d101f', 20);
      fx.burst(item.x, y, PETALS, 12, 170);
      Juegos.sfx('bonus');
      return;
    }
    const points = ITEMS[item.type].points;
    addScore(points);
    fx.label('+' + points, item.x, y - 20, item.type === 'anillo' ? '#ab5823' : '#4b584f', item.type === 'anillo' ? 24 : 18);
    fx.burst(item.x, y, item.type === 'anillo' ? GOLD : PETALS, item.type === 'anillo' ? 12 : 7, 150);
    Juegos.sfx(item.type === 'anillo' ? 'bonus' : 'pick');
  }

  function cleared() {
    dodged++;
    addScore(1);
    Juegos.sfx('tick');
  }

  function update(dt) {
    clock += dt;
    const v = speed();
    travelled += v * dt;
    safeFor = Math.max(0, safeFor - dt);

    const nextStage = Math.min(STAGES.length - 1, Math.floor(clock / STAGE_SECONDS));
    if (nextStage !== stageIndex) {
      stageIndex = nextStage;
      Juegos.toast(toastEl, STAGES[stageIndex].name);
      Juegos.sfx('win');
    }

    const before = player.y;
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;

    // What is under the feet: the ground unless there is a hole, or a table landed on from above
    const overPit = pits.some(function (p) {
      return player.x > p.x + 8 && player.x < p.x + p.w - 8;
    });
    let floor = overPit ? -Infinity : 0;
    for (const p of platforms) {
      const over = player.x > p.x - 6 && player.x < p.x + p.w + 6;
      if (over && before >= p.h - 0.5 && player.y <= p.h && player.vy <= 0) floor = Math.max(floor, p.h);
    }
    // Already inside a hole: the floor beside it can't catch you any more
    if (before < -2) floor = -Infinity;
    if (player.y <= floor) {
      player.y = floor;
      player.vy = 0;
      player.jumps = 0;
    }
    if (player.y < -70) {
      crash('Te tragó un hueco de la pista.');
      return;
    }

    nextIn -= v * dt;
    if (nextIn <= 0) spawnGroup();

    const left = player.x - 13;
    const right = player.x + 13;
    const feet = player.y;
    const head = player.y + player.h * 0.9;

    for (let i = platforms.length - 1; i >= 0; i--) {
      platforms[i].x -= v * dt;
      if (platforms[i].x + platforms[i].w < -30) platforms.splice(i, 1);
    }

    for (let i = pits.length - 1; i >= 0; i--) {
      const pit = pits[i];
      pit.x -= v * dt;
      if (!pit.passed && pit.x + pit.w < left) {
        pit.passed = true;
        cleared();
      }
      if (pit.x + pit.w < -30) pits.splice(i, 1);
    }

    for (let i = springs.length - 1; i >= 0; i--) {
      const spring = springs[i];
      spring.x -= v * dt;
      spring.squash = Math.max(0, spring.squash - dt);
      if (spring.x < -40) {
        springs.splice(i, 1);
      } else if (Math.abs(spring.x - player.x) < 24 && player.y <= 14 && player.y >= 0 && player.vy <= 0) {
        // Landing on it (or running into it) launches you; one more jump is still allowed in the air
        player.y = 14;
        player.vy = BOUNCE;
        player.jumps = 1;
        spring.squash = 0.3;
        hintEl.hidden = true;
        fx.burst(spring.x, H - FLOOR - 12, GOLD, 10, 200);
        fx.label('¡Boing!', spring.x, H - FLOOR - 60, '#ab5823', 20);
        Juegos.sfx('bonus');
      }
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      item.x -= v * dt;
      if (item.x < -40) {
        items.splice(i, 1);
      } else if (Math.abs(item.x - player.x) < 28 && item.y > feet - 12 && item.y < head + 12) {
        items.splice(i, 1);
        collect(item);
      }
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= (v + o.extra) * dt;
      if (o.x + o.w < -30) {
        obstacles.splice(i, 1);
        continue;
      }
      if (!o.passed && o.x + o.w < left) {
        o.passed = true;
        cleared();
      }
      const hit = right > o.x + 6 && left < o.x + o.w - 6 &&
        head > o.lift + 4 && feet < o.lift + o.h - 4;
      if (!hit || safeFor > 0) continue;
      if (shield) {
        // The bouquet takes the hit for you
        shield = false;
        safeFor = 0.9;
        obstacles.splice(i, 1);
        fx.label('¡Te salvó el ramo!', player.x + 40, H - FLOOR - player.y - player.h - 10, '#5d101f', 17);
        fx.burst(o.x + o.w / 2, H - FLOOR - o.lift - o.h / 2, PETALS, 18, 230);
        Juegos.sfx('match');
        continue;
      }
      player.vy = 520;
      fx.burst(player.x, H - FLOOR - player.y - player.h * 0.6, PETALS, 14, 220);
      crash(o.kind === 'cart' ? 'Te atropelló el carrito de la torta.' : 'Te alcanzó: «' + o.text + '»');
      return;
    }
  }

  // The runner gets knocked off the screen (or keeps falling down the hole) before the result shows
  function updateDying(dt) {
    dyingFor += dt;
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    player.rot += 9 * dt;
    if (dyingFor > 0.9) gameOver();
  }

  // ---- Drawing ----

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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBubble(b) {
    const top = H - FLOOR - b.lift - b.h;
    ctx.fillStyle = '#fbf8f3';
    ctx.strokeStyle = '#5d101f';
    ctx.lineWidth = 2;
    if (b.lift) {
      // Floating bubbles get a tail, so they read as speech and not as a platform
      ctx.beginPath();
      ctx.moveTo(b.x + b.w - 26, top + b.h - 2);
      ctx.lineTo(b.x + b.w - 8, top + b.h + 12);
      ctx.lineTo(b.x + b.w - 12, top + b.h - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    roundRect(b.x, top, b.w, b.h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#5d101f';
    ctx.font = BUBBLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    b.lines.forEach(function (line, i) {
      ctx.fillText(line, b.x + b.w / 2, top + 8 + LINE_H / 2 + i * LINE_H);
    });
  }

  function drawCart(c) {
    const ground = H - FLOOR;
    const cx = c.x + c.w / 2;
    // Speed lines behind it
    ctx.strokeStyle = 'rgba(93, 16, 31, .3)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    [14, 26, 38].forEach(function (dy, i) {
      ctx.moveTo(c.x + c.w + 6 + i * 3, ground - dy);
      ctx.lineTo(c.x + c.w + 22 + i * 5, ground - dy);
    });
    ctx.stroke();
    Juegos.drawSprite(ctx, sprites.cart, cx, ground - 34);
    ctx.fillStyle = '#b8a088';
    ctx.fillRect(c.x - 2, ground - 9, c.w + 4, 4);
    ctx.fillStyle = '#5c544d';
    ctx.beginPath();
    ctx.arc(c.x + 10, ground - 4, 4.5, 0, Math.PI * 2);
    ctx.arc(c.x + c.w - 10, ground - 4, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // A long banquet table seen from the side
  function drawPlatform(p) {
    const top = H - FLOOR - p.h;
    ctx.fillStyle = '#8f7a63';
    ctx.fillRect(p.x + 12, top + 10, 6, 16);
    ctx.fillRect(p.x + p.w - 18, top + 10, 6, 16);
    ctx.fillStyle = '#fbf8f3';
    roundRect(p.x, top, p.w, 13, 5);
    ctx.fill();
    ctx.strokeStyle = '#b8a088';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Runner cloth along the edge
    ctx.fillStyle = p.h > LOW ? '#5d101f' : '#c58b78';
    ctx.fillRect(p.x + 4, top + 9, p.w - 8, 3);
  }

  function drawSpring(s) {
    const ground = H - FLOOR;
    const press = Math.sin((s.squash / 0.3) * Math.PI) * 6;
    // Coils
    ctx.strokeStyle = '#8f7a63';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = ground - 3 - i * (4 - press / 3);
      ctx.moveTo(s.x - 15, y);
      ctx.lineTo(s.x + 15, y - 2);
    }
    ctx.stroke();
    // Cushion
    ctx.fillStyle = '#5d101f';
    roundRect(s.x - 22, ground - 22 + press, 44, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#c39a52';
    ctx.fillRect(s.x - 16, ground - 19 + press, 32, 2.5);
  }

  function drawFloor() {
    const ground = H - FLOOR;
    ctx.fillStyle = '#b8a088';
    ctx.fillRect(0, ground, W, FLOOR);
    ctx.fillStyle = '#5d101f';
    ctx.fillRect(0, ground, W, 3);
    // Moving tiles so speed is readable
    ctx.fillStyle = 'rgba(251, 248, 243, .55)';
    for (let x = -(travelled % 40); x < W; x += 40) {
      ctx.fillRect(x, ground + 12, 20, 4);
    }
    // Holes: cut the floor away and show the dark underneath
    for (const pit of pits) {
      ctx.clearRect(pit.x, ground, pit.w, FLOOR);
      const depth = ctx.createLinearGradient(0, ground, 0, H);
      depth.addColorStop(0, 'rgba(47, 42, 38, .55)');
      depth.addColorStop(1, 'rgba(47, 42, 38, .95)');
      ctx.fillStyle = depth;
      ctx.fillRect(pit.x, ground, pit.w, FLOOR);
      ctx.fillStyle = '#5d101f';
      ctx.fillRect(pit.x - 3, ground, 3, FLOOR);
      ctx.fillRect(pit.x + pit.w, ground, 3, FLOOR);
    }
  }

  function drawPlayer() {
    const ground = H - FLOOR;
    const feetY = ground - player.y;
    const airborne = player.vy !== 0 || player.y < 0;
    const stride = Math.sin(travelled * 0.07);

    if (shield) {
      // The bouquet's protection
      ctx.strokeStyle = 'rgba(171, 88, 35, .55)';
      ctx.fillStyle = 'rgba(197, 139, 120, .16)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(player.x, feetY - player.h / 2, 38, player.h * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.save();
    if (state === 'dying') {
      // Tumble around the middle of the body
      ctx.translate(player.x, feetY - player.h / 2);
      ctx.rotate(player.rot);
      ctx.translate(-player.x, -(feetY - player.h / 2));
    }
    // Blink during the grace period after the shield breaks
    if (safeFor > 0 && Math.floor(safeFor * 12) % 2 === 0) ctx.globalAlpha = 0.5;
    Juegos.drawFigure(ctx, {
      who: who,
      face: faces[who],
      x: player.x,
      feetY: feetY,
      headH: HEAD_H,
      tilt: 0.1,
      // Running: arms and legs swing opposite. Jumping: knees tucked, arms up.
      legs: airborne ? [0.75, -0.55] : [stride * 0.8, -stride * 0.8],
      arms: airborne ? [-0.7, -0.5] : [1.1 - stride * 0.7, 1.1 + stride * 0.7]
    });
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const ground = H - FLOOR;
    const hills = STAGES[stageIndex].hills;

    drawHills(travelled * 0.1, 0.72, 24, 0.011, 0.023, hills[0]);
    drawHills(travelled * 0.26 + 400, 0.85, 20, 0.016, 0.031, hills[1]);

    platforms.forEach(drawPlatform);
    springs.forEach(drawSpring);
    for (const item of items) {
      Juegos.drawSprite(ctx, sprites[item.type], item.x, ground - item.y + Math.sin(clock * 4 + item.phase) * 4);
    }
    obstacles.forEach(function (o) {
      if (o.kind === 'cart') drawCart(o);
      else drawBubble(o);
    });

    // The floor goes over the runner, so falling into a hole really disappears into it
    drawPlayer();
    drawFloor();

    // Shadow on the floor, smaller the higher you are, and none over a hole
    const overPit = pits.some(function (p) {
      return player.x > p.x && player.x < p.x + p.w;
    });
    if (!overPit && player.y >= 0) {
      const shade = Math.max(0.3, 1 - player.y / 240);
      ctx.fillStyle = 'rgba(47, 42, 38, .2)';
      ctx.beginPath();
      ctx.ellipse(player.x, ground + 5, 20 * shade, 4.5 * shade, 0, 0, Math.PI * 2);
      ctx.fill();
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
    if (state === 'playing') update(dt);
    else updateDying(dt);
    fx.update(dt);
    draw();
    if (state !== 'over') requestAnimationFrame(loop);
  }

  stage.addEventListener('pointerdown', jump);
  window.addEventListener('keydown', function (e) {
    if (e.repeat || state !== 'playing') return;
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      jump();
    }
  });

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Hice ' + score + (score === 1 ? ' punto' : ' puntos') +
      ' en La gran huida de la boda de Cami & Sebas. ¿Me superas?');
  });

  window.addEventListener('resize', resize);
  Juegos.mountPlayerPick(function (name) {
    who = name;
    player.h = Juegos.figureHeight(who, HEAD_H);
    draw();
  });
  renderBest();
  resize();
})();
