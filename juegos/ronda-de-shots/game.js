(function () {
  const GAME = 'ronda-de-shots';
  const ROUND_SECONDS = 30;
  const HOLES = 9;
  const CAMI_PENALTY = 2;
  const GOLD_POINTS = 3;
  const MAX_MULT = 3;
  const STREAK_STEP = 5; // shots in a row per multiplier level
  const FRENZY_AT = 0.7; // share of the round after which two pop up at once
  const FACES = {
    sebas: '../../assets/juegos/sebas.webp',
    gold: '../../assets/juegos/sebas.webp',
    cami: '../../assets/juegos/cami.webp'
  };
  const CHEERS = ['¡Salud!', '¡Otro!', '¡Fondo blanco!', '¡Wepa!', '¡Qué rico!'];

  const VERDICTS = [
    { min: 0, text: 'Sebas sigue con sed.' },
    { min: 12, text: 'Apenas para entrar en calor.' },
    { min: 28, text: 'La ronda va por tu cuenta.' },
    { min: 45, text: 'El alma de la barra.' },
    { min: 65, text: 'Cami pide que mejor ya le sirvas agua.' }
  ];

  const stage = document.getElementById('stage');
  const grid = document.getElementById('grid');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const progressEl = document.getElementById('progress');
  const comboEl = document.getElementById('combo');
  const startPanel = document.getElementById('startPanel');
  const overPanel = document.getElementById('overPanel');

  let state = 'ready';
  let score = 0;
  let streak = 0;
  let startedAt = 0;
  let spawnTimer = 0;
  let clockTimer = 0;
  let lastSecond = 0;
  let frenzy = false;
  const holes = [];

  const pour = document.createElement('img');
  pour.className = 'pour';
  pour.src = '../../assets/juegos/sprites/shot.svg';
  pour.alt = '';
  stage.appendChild(pour);

  // A shot glass tips over right where the finger tapped
  function serve(e) {
    if (state !== 'playing') return;
    const rect = stage.getBoundingClientRect();
    pour.style.left = (e.clientX - rect.left - 4) + 'px';
    pour.style.top = (e.clientY - rect.top - 66) + 'px';
    pour.classList.remove('is-pouring');
    void pour.offsetWidth; // restart the animation
    pour.classList.add('is-pouring');
  }

  function buildHoles() {
    for (let i = 0; i < HOLES; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mole-hole';
      el.setAttribute('aria-label', 'Hoyo ' + (i + 1));
      el.innerHTML =
        '<span class="mole-face"><img alt=""></span>' +
        '<span class="mole-bush"></span>' +
        '<span class="mole-pow"></span>' +
        '<span class="mole-bubble"></span>';
      const hole = { el: el, img: el.querySelector('img'), bubble: el.querySelector('.mole-bubble'), who: null, hideTimer: 0 };
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        serveHole(hole);
      });
      holes.push(hole);
      grid.appendChild(el);
    }
  }

  // 0 at the start of the round, 1 at the end
  function progress() {
    return Math.min(1, (performance.now() - startedAt) / (ROUND_SECONDS * 1000));
  }

  function mult() {
    return Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_STEP));
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

  function setScore(value) {
    score = Math.max(0, value);
    scoreEl.textContent = score;
    scoreEl.classList.remove('is-bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('is-bump');
  }

  function hide(hole) {
    clearTimeout(hole.hideTimer);
    hole.who = null;
    hole.el.classList.remove('is-up');
  }

  function popUp(t) {
    const free = holes.filter(function (h) {
      return !h.who && !h.el.classList.contains('is-hit');
    });
    if (!free.length) return;
    const hole = free[Math.floor(Math.random() * free.length)];
    const roll = Math.random();
    let who = 'sebas';
    if (roll < 0.2 + 0.1 * t) who = 'cami';
    else if (roll > 0.9 && t > 0.1) who = 'gold';

    hole.who = who;
    hole.img.src = FACES[who];
    hole.el.classList.toggle('is-gold', who === 'gold');
    hole.el.classList.add('is-up');
    hole.hideTimer = setTimeout(function () {
      hide(hole);
    }, who === 'gold' ? 720 - 200 * t : 1150 - 500 * t);
  }

  function spawn() {
    if (state !== 'playing') return;
    const t = progress();
    if (t >= FRENZY_AT && !frenzy) {
      frenzy = true;
      if (mult() === 1) {
        Juegos.toast(comboEl, '¡Recta final!');
        setTimeout(function () {
          if (mult() === 1) comboEl.hidden = true;
        }, 1600);
      }
    }
    popUp(t);
    if (frenzy) popUp(t);
    spawnTimer = setTimeout(spawn, 780 - 360 * t);
  }

  function serveHole(hole) {
    if (state !== 'playing' || !hole.who) return;
    const who = hole.who;
    hide(hole);

    if (who === 'cami') {
      setScore(score - CAMI_PENALTY);
      setStreak(0);
      hole.bubble.textContent = '¡Yo manejo! −' + CAMI_PENALTY;
      Juegos.sfx('bad');
      Juegos.shake(stage);
    } else {
      const gained = (who === 'gold' ? GOLD_POINTS : 1) * mult();
      setScore(score + gained);
      hole.bubble.textContent = CHEERS[Math.floor(Math.random() * CHEERS.length)] + ' +' + gained;
      Juegos.sfx(who === 'gold' ? 'bonus' : 'pick');
      if (navigator.vibrate) navigator.vibrate(25);
      setStreak(streak + 1);
    }

    hole.el.classList.add('is-hit');
    setTimeout(function () {
      hole.el.classList.remove('is-hit');
    }, 520);
  }

  function tick() {
    const left = Math.max(0, ROUND_SECONDS - (performance.now() - startedAt) / 1000);
    const seconds = Math.ceil(left);
    timeEl.textContent = seconds + ' s';
    timeEl.classList.toggle('is-ending', left <= 5 && left > 0);
    progressEl.style.setProperty('--p', left / ROUND_SECONDS);
    if (seconds !== lastSecond && seconds <= 5 && seconds > 0) Juegos.sfx('tick');
    lastSecond = seconds;
    if (left <= 0) gameOver();
  }

  function start() {
    state = 'counting';
    score = 0;
    streak = 0;
    frenzy = false;
    lastSecond = ROUND_SECONDS;
    scoreEl.textContent = '0';
    timeEl.textContent = ROUND_SECONDS + ' s';
    timeEl.classList.remove('is-ending');
    progressEl.style.setProperty('--p', 1);
    comboEl.hidden = true;
    holes.forEach(hide);
    startPanel.hidden = true;
    overPanel.hidden = true;
    Juegos.countdown(stage, function () {
      state = 'playing';
      startedAt = performance.now();
      clockTimer = setInterval(tick, 200);
      spawnTimer = setTimeout(spawn, 350);
    });
  }

  function gameOver() {
    state = 'over';
    clearInterval(clockTimer);
    clearTimeout(spawnTimer);
    holes.forEach(hide);
    comboEl.hidden = true;
    timeEl.classList.remove('is-ending');
    Juegos.finish({
      game: GAME,
      score: score,
      title: score === 1 ? 'Punto' : 'Puntos',
      verdict: Juegos.verdict(VERDICTS, score)
    });
  }

  stage.addEventListener('pointerdown', serve);
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Hice ' + score + (score === 1 ? ' punto' : ' puntos') +
      ' sirviendo shots en la boda de Cami & Sebas. ¿Me superas?');
  });

  progressEl.style.setProperty('--p', 1);
  buildHoles();
})();
