(function () {
  const GAME = 'hora-loca';
  const CLIP = '../../assets/juegos/audio/baile.mp3';
  // Measured from the clip: steady tempo, first beat right after the fade-in
  const BPM = 128.044;
  const FIRST_BEAT = 0.17;
  const BEAT = 60 / BPM;
  const START_BEAT = 8;
  const END_BEAT = 128;
  const FALL = 1.3; // seconds a note takes to reach the hit line
  const PERFECT = 0.065;
  const GOOD = 0.14;
  const MAX_MULT = 4;
  const COMBO_STEP = 10;
  const LANE_COLORS = ['#5d101f', '#ab5823', '#707f75'];
  const LANE_KEYS = { ArrowLeft: 0, a: 0, A: 0, ArrowDown: 1, s: 1, S: 1, ArrowRight: 2, d: 2, D: 2 };

  // {n} is replaced with whoever is dancing
  const VERDICTS = {
    sebas: [
      { min: 0, text: 'Sebas bailó como en su primera clase.' },
      { min: 150, text: 'Dos pies izquierdos, pero con actitud.' },
      { min: 400, text: 'Ya se ganó un aplauso de la pista.' },
      { min: 750, text: 'El alma de la hora loca.' },
      { min: 1050, text: 'Kiss lo quiere de bailarín en la gira.' }
    ],
    cami: [
      { min: 0, text: 'Cami bailó como en su primera clase.' },
      { min: 150, text: 'Dos pies izquierdos, pero con actitud.' },
      { min: 400, text: 'Ya se ganó un aplauso de la pista.' },
      { min: 750, text: 'El alma de la hora loca.' },
      { min: 1050, text: 'Kiss la quiere de bailarina en la gira.' }
    ]
  };

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const comboEl = document.getElementById('combo');
  const progressEl = document.getElementById('progress');
  const bestEl = document.getElementById('best');
  const startPanel = document.getElementById('startPanel');
  const overPanel = document.getElementById('overPanel');
  const startBtn = document.getElementById('startBtn');

  const faces = {};
  Object.keys(Juegos.CHARACTERS).forEach(function (name) {
    faces[name] = new Image();
    faces[name].src = Juegos.CHARACTERS[name].src;
    faces[name].addEventListener('load', function () {
      draw();
    });
  });
  let who = Juegos.player();
  const beer = Juegos.sprite('../../assets/juegos/sprites/cerveza.svg', 48);
  const fx = Juegos.fx();

  let W = 0;
  let H = 0;
  let state = 'ready';
  let score = 0;
  let combo = 0;
  let hits = 0;
  let notes = [];
  let pose = 1; // lane of the last move Sebas made
  let poseAt = -9;
  let stumbleAt = -9;
  let padFlash = [-9, -9, -9];
  let judgement = null; // { text, color, at }

  let audio = null;
  let buffer = null;
  let source = null;
  let gain = null;
  let audioStart = 0; // AudioContext time at which the clip starts
  let wallStart = 0; // fallback clock when audio is unavailable
  let useAudioClock = false;

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function renderBest() {
    const best = Juegos.getBest(GAME);
    bestEl.textContent = best ? 'Récord ' + best : '';
  }

  // Seconds into the clip, as the player hears it
  function songTime() {
    if (useAudioClock) return audio.currentTime - audioStart - (audio.outputLatency || audio.baseLatency || 0);
    return (performance.now() - wallStart) / 1000;
  }

  function beatTime(beat) {
    return FIRST_BEAT + beat * BEAT;
  }

  // Same chart for everyone, so the podium is fair
  function buildChart() {
    let seed = 20261114;
    const random = function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const chart = [];
    let last = -1;
    let repeats = 0;
    const add = function (beat) {
      let lane = Math.floor(random() * 3);
      if (lane === last && ++repeats >= 2) lane = (lane + 1 + Math.floor(random() * 2)) % 3;
      if (lane !== last) repeats = 0;
      last = lane;
      chart.push({ t: beatTime(beat), lane: lane, state: 'pending' });
    };
    for (let beat = START_BEAT; beat < END_BEAT; beat++) {
      // Warm-up: every other beat. Then every beat. Then off-beats sneak in.
      if (beat < 40 && beat % 2 === 1) continue;
      add(beat);
      if (beat >= 80 && random() < 0.34) add(beat + 0.5);
    }
    return chart;
  }

  function mult() {
    return Math.min(MAX_MULT, 1 + Math.floor(combo / COMBO_STEP));
  }

  function setCombo(value) {
    const before = mult();
    combo = value;
    const now = mult();
    if (combo < 5) {
      comboEl.hidden = true;
    } else if (now !== before) {
      Juegos.toast(comboEl, 'Combo x' + now);
    } else {
      comboEl.textContent = combo + ' seguidas' + (now > 1 ? ' · x' + now : '');
      comboEl.hidden = false;
    }
  }

  // Must run inside the tap that starts the game: iOS only unlocks audio from a user gesture
  function unlockAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audio) {
      audio = new AudioCtx();
      gain = audio.createGain();
      gain.connect(audio.destination);
    }
    if (audio.state !== 'running') audio.resume().catch(function () { });
  }

  function loadClip() {
    if (!audio) return Promise.reject(new Error('no audio'));
    if (buffer) return Promise.resolve();
    return fetch(CLIP)
      .then(function (r) {
        return r.arrayBuffer();
      })
      .then(function (data) {
        // Callback form: older Safari has no promise version
        return new Promise(function (resolve, reject) {
          audio.decodeAudioData(data, resolve, reject);
        });
      })
      .then(function (decoded) {
        buffer = decoded;
      });
  }

  // Resolves true when the music is really running; false means play silently on a wall clock
  function startMusic() {
    return loadClip()
      .then(function () {
        const resumed = audio.state === 'running' ? Promise.resolve() : audio.resume();
        const timeout = new Promise(function (resolve) {
          setTimeout(resolve, 600);
        });
        return Promise.race([resumed, timeout]);
      })
      .then(function () {
        if (audio.state !== 'running') return false;
        gain.gain.value = Juegos.isMuted() ? 0 : 0.9;
        source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        audioStart = audio.currentTime + 0.12;
        source.start(audioStart);
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function stopMusic() {
    if (!source) return;
    try {
      gain.gain.setTargetAtTime(0, audio.currentTime, 0.25);
      source.stop(audio.currentTime + 1);
    } catch (e) { /* already stopped */ }
    source = null;
  }

  function start() {
    if (state === 'loading' || state === 'playing') return;
    state = 'loading';
    unlockAudio();
    startBtn.textContent = 'Cargando…';
    overPanel.hidden = true;
    startMusic().then(function (withAudio) {
      useAudioClock = withAudio;
      wallStart = performance.now() + 120;
      score = 0;
      combo = 0;
      hits = 0;
      notes = buildChart();
      who = Juegos.player();
      pose = 1;
      poseAt = stumbleAt = -9;
      padFlash = [-9, -9, -9];
      judgement = null;
      fx.clear();
      scoreEl.textContent = '0';
      comboEl.hidden = true;
      progressEl.style.setProperty('--p', 0);
      renderBest();
      startPanel.hidden = true;
      startBtn.textContent = 'Jugar';
      state = 'playing';
      requestAnimationFrame(loop);
    });
  }

  function gameOver() {
    state = 'over';
    stopMusic();
    comboEl.hidden = true;
    const accuracy = Math.round((hits / notes.length) * 100);
    Juegos.finish({
      game: GAME,
      score: score,
      title: 'Puntos · ' + accuracy + '% de acierto',
      verdict: Juegos.verdict(VERDICTS[who], score)
    });
    renderBest();
  }

  function hitLineY() {
    return H - 84;
  }

  function laneX(lane) {
    return W * (lane + 0.5) / 3;
  }

  function judge(text, color, now) {
    judgement = { text: text, color: color, at: now };
  }

  function tap(lane) {
    if (state !== 'playing') return;
    const now = songTime();
    padFlash[lane] = now;

    // Earliest note still waiting in this lane that is close enough
    let target = null;
    for (const note of notes) {
      if (note.state !== 'pending' || note.lane !== lane) continue;
      if (note.t - now > GOOD) break;
      if (Math.abs(note.t - now) <= GOOD) {
        target = note;
        break;
      }
    }
    if (!target) return;

    const perfect = Math.abs(target.t - now) <= PERFECT;
    target.state = 'hit';
    hits++;
    const gained = (perfect ? 3 : 1) * mult();
    score += gained;
    scoreEl.textContent = score;
    setCombo(combo + 1);
    pose = lane;
    poseAt = now;
    judge(perfect ? '¡Perfecto!' : 'Bien', perfect ? '#ab5823' : '#4b584f', now);
    fx.burst(laneX(lane), hitLineY(), who === 'sebas' ? ['#e3a93b', '#fbf8f3', '#f0c56a'] : [LANE_COLORS[lane], '#fbf8f3', '#c58b78'],
      perfect ? 12 : 6, 170);
    Juegos.sfx(perfect ? 'pick' : 'tick');
  }

  function update(now) {
    for (const note of notes) {
      if (note.state === 'pending' && now - note.t > GOOD) {
        note.state = 'missed';
        setCombo(0);
        stumbleAt = now;
        judge('Uy', '#5d101f', now);
      }
    }
    progressEl.style.setProperty('--p', Math.max(0, Math.min(1, now / beatTime(END_BEAT))));
    if (now > beatTime(END_BEAT) + 0.6) gameOver();
  }

  function drawFlower(x, y, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fbf8f3';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The dancer leans to the lane you hit, bounces on the beat and wobbles when you miss
  function drawDancer(now) {
    const beatPhase = ((now - FIRST_BEAT) / BEAT) % 1;
    const bounce = state === 'playing' ? Math.pow(1 - (beatPhase < 0 ? 0 : beatPhase), 2) * 8 : 0;
    const sincePose = now - poseAt;
    const moving = sincePose < 0.5 ? 1 - sincePose / 0.5 : 0;
    const lean = (pose - 1) * moving;
    const stumble = now - stumbleAt < 0.4 ? Math.sin((now - stumbleAt) * 40) * 0.12 : 0;
    const swing = Math.sin(now * Math.PI / BEAT) * 0.25;
    const headH = Math.min(112, H * 0.165);

    Juegos.drawFigure(ctx, {
      who: who,
      face: faces[who],
      x: W / 2 + lean * W * 0.1,
      // Same spot for both: measured from Sebas so the floor doesn't jump when switching
      feetY: H * 0.135 + Juegos.figureHeight('sebas', headH) - bounce,
      headH: headH,
      tilt: lean * 0.2 + stumble,
      legs: [-0.12 - lean * 0.18, 0.12 - lean * 0.18],
      // Both arms up on a centre hit, one out to the side otherwise
      arms: [-1, 1].map(function (side) {
        const raised = (pose === 1 || pose === side + 1) ? moving : 0;
        return 0.5 + swing * side - raised * 2.1;
      })
    });
  }

  function draw() {
    const now = state === 'playing' ? songTime() : 0;
    ctx.clearRect(0, 0, W, H);

    drawDancer(now);

    const lineY = hitLineY();
    const laneTop = H * 0.47;

    // Lanes
    for (let lane = 0; lane < 3; lane++) {
      const x = laneX(lane);
      const grad = ctx.createLinearGradient(0, laneTop, 0, lineY);
      grad.addColorStop(0, 'rgba(184, 160, 136, 0)');
      grad.addColorStop(1, 'rgba(184, 160, 136, .22)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - W / 6 + 5, laneTop, W / 3 - 10, lineY - laneTop + 40);

      // Pad on the hit line
      const flash = Math.max(0, 1 - (now - padFlash[lane]) / 0.18);
      ctx.lineWidth = 4;
      ctx.strokeStyle = LANE_COLORS[lane];
      ctx.fillStyle = 'rgba(251, 248, 243, ' + (0.6 + flash * 0.4) + ')';
      ctx.beginPath();
      ctx.arc(x, lineY, 27 + flash * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Falling notes
    for (const note of notes) {
      if (note.state === 'hit') continue;
      const ahead = note.t - now;
      if (ahead > FALL || ahead < -0.3) continue;
      const y = lineY - (ahead / FALL) * (lineY - laneTop);
      const fade = note.state === 'missed' ? 0.25 : Math.min(1, (FALL - ahead) / 0.25);
      if (who === 'sebas') {
        // Sebas dances for beers, Cami for flowers
        ctx.globalAlpha = fade;
        Juegos.drawSprite(ctx, beer, laneX(note.lane), y);
        ctx.globalAlpha = 1;
      } else {
        drawFlower(laneX(note.lane), y, 21, LANE_COLORS[note.lane], fade);
      }
    }

    if (judgement && now - judgement.at < 0.5) {
      ctx.globalAlpha = 1 - (now - judgement.at) / 0.5;
      ctx.font = '600 22px Montserrat, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(251, 248, 243, .95)';
      ctx.strokeText(judgement.text, W / 2, lineY - 62);
      ctx.fillStyle = judgement.color;
      ctx.fillText(judgement.text, W / 2, lineY - 62);
      ctx.globalAlpha = 1;
    }

    fx.draw(ctx);
  }

  let lastFrame = 0;
  function loop(frame) {
    if (state !== 'playing') {
      draw();
      return;
    }
    const dt = lastFrame ? Math.min(0.05, (frame - lastFrame) / 1000) : 0;
    lastFrame = frame;
    update(songTime());
    fx.update(dt);
    draw();
    if (state === 'playing') requestAnimationFrame(loop);
  }

  stage.addEventListener('pointerdown', function (e) {
    if (state !== 'playing') return;
    const x = e.clientX - stage.getBoundingClientRect().left;
    tap(Math.max(0, Math.min(2, Math.floor(x / (W / 3)))));
  });
  window.addEventListener('keydown', function (e) {
    if (e.repeat || !(e.key in LANE_KEYS)) return;
    e.preventDefault();
    tap(LANE_KEYS[e.key]);
  });

  // Follow the sound toggle while the song plays
  document.querySelectorAll('[data-sound-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (gain) gain.gain.value = Juegos.isMuted() ? 0 : 0.9;
    });
  });
  // Leaving the tab would desync the song from the notes
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing' && useAudioClock) gameOver();
  });

  startBtn.addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Hice ' + score + ' puntos en la hora loca con ' + Juegos.CHARACTERS[who].label +
      ' en la boda de Cami & Sebas. ¿Me superas?');
  });

  window.addEventListener('resize', resize);
  Juegos.mountPlayerPick(function (name) {
    who = name;
    draw();
  });
  renderBest();
  resize();
})();
