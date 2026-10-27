(function () {
  const TEAM_NAMES = { cami: 'Cami', sebas: 'Sebas' };
  const pull = document.getElementById('pull');
  const you = document.getElementById('you');
  const boostEl = document.getElementById('boost');
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  const faces = {};
  Object.keys(Juegos.CHARACTERS).forEach(function (name) {
    faces[name] = new Image();
    faces[name].src = Juegos.CHARACTERS[name].src;
  });

  let W = 0;
  let H = 0;
  let shown = 0; // rope position on screen, eased toward the server's
  let target = 0;
  let playing = false;
  let boosting = false;
  let winner = null;
  let myTeam = '';
  let pulse = 0; // kick from the player's own taps

  const sala = Sala.open({ game: 'tira-y-afloja', render: render });

  sala.tapper(pull, function () {
    pulse = 1;
    pull.classList.remove('is-hit');
    void pull.offsetWidth; // restart the press animation
    pull.classList.add('is-hit');
    if (navigator.vibrate) navigator.vibrate(8);
  });

  document.querySelectorAll('#lobby [data-team]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sala.send({ t: 'team', team: btn.dataset.team });
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

  function render(state, me) {
    const g = state.g;
    const teams = g.teams || { cami: 0, sebas: 0 };
    const rate = g.rate || { cami: 0, sebas: 0 };
    const effort = rate.cami + rate.sebas || 1;
    document.getElementById('nCami').textContent = teams.cami;
    document.getElementById('nSebas').textContent = teams.sebas;
    document.getElementById('rateCami').style.width = Math.round(rate.cami / effort * 100) + '%';
    document.getElementById('rateSebas').style.width = Math.round(rate.sebas / effort * 100) + '%';

    target = g.pos || 0;
    playing = state.phase === 'playing';
    winner = state.phase === 'results' ? g.winner : null;
    if (g.boost && !boosting) Juegos.sfx('bonus');
    boosting = !!g.boost && playing;
    boostEl.hidden = !boosting;
    myTeam = me ? me.team : '';

    document.querySelectorAll('#lobby [data-team]').forEach(function (btn) {
      const team = btn.dataset.team;
      btn.setAttribute('aria-pressed', String(myTeam === team));
      btn.textContent = 'Equipo ' + TEAM_NAMES[team] + ' · ' + teams[team];
    });
    pull.dataset.team = myTeam;
    pull.disabled = !playing;
    pull.classList.toggle('is-boost', boosting);

    if (!me) {
      you.textContent = '';
    } else if (playing) {
      // Where you stand among your own team
      const mates = state.players.filter(function (p) {
        return p.team === me.team;
      }).sort(function (a, b) {
        return b.taps - a.taps;
      });
      you.textContent = me.taps + ' jalones · vas ' + (mates.indexOf(me) + 1) + '.º de tu equipo';
    } else {
      you.textContent = 'Jalas para el Equipo ' + TEAM_NAMES[me.team];
    }
  }

  function draw(time) {
    const t = time / 1000;
    shown += (target - shown) * 0.18;
    pulse *= 0.86;
    ctx.clearRect(0, 0, W, H);

    const ground = H - 22;
    const centre = W / 2;
    const headH = Math.max(34, Math.min(50, H * 0.24));
    const reach = Math.min(W * 0.3, 150);
    const knot = centre + shown * W * 0.24;

    // Ground, each side's line, and the puddle nobody wants to land in
    ctx.fillStyle = 'rgba(184, 160, 136, .45)';
    ctx.fillRect(0, ground, W, 4);
    ctx.fillStyle = 'rgba(93, 16, 31, .16)';
    ctx.beginPath();
    ctx.ellipse(centre, ground + 3, 34, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    [[centre - W * 0.24, '#c58b78'], [centre + W * 0.24, '#4b584f']].forEach(function (line) {
      ctx.fillStyle = line[1];
      ctx.fillRect(line[0] - 2, ground - 16, 4, 20);
    });

    // Both lean back; the harder the round, the more they shake
    const strain = playing ? Math.sin(t * 22) * 0.035 : 0;
    const lost = winner && winner !== 'empate';
    const camiX = knot - reach;
    const sebasX = knot + reach;
    const ropeY = ground - headH * 1.02;

    // Rope
    ctx.lineCap = 'round';
    ctx.strokeStyle = boosting ? '#e3b04b' : '#b8a088';
    ctx.lineWidth = boosting ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(camiX + headH * 0.45, ropeY);
    ctx.lineTo(sebasX - headH * 0.45, ropeY);
    ctx.stroke();
    ctx.strokeStyle = '#8f7a63';
    ctx.lineWidth = 1.5;
    for (let x = camiX + headH * 0.6; x < sebasX - headH * 0.5; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, ropeY - 2);
      ctx.lineTo(x + 4, ropeY + 2);
      ctx.stroke();
    }
    // Flag on the knot
    ctx.fillStyle = '#5d101f';
    ctx.fillRect(knot - 1.5, ropeY - 22, 3, 34);
    ctx.beginPath();
    ctx.moveTo(knot + 1, ropeY - 22);
    ctx.lineTo(knot + 17, ropeY - 15);
    ctx.lineTo(knot + 1, ropeY - 8);
    ctx.closePath();
    ctx.fill();

    const kick = { cami: myTeam === 'cami' ? pulse * 0.1 : 0, sebas: myTeam === 'sebas' ? pulse * 0.1 : 0 };
    Juegos.drawFigure(ctx, {
      who: 'cami', face: faces.cami, x: camiX, feetY: ground, headH: headH,
      // The loser tips forward into the puddle
      tilt: lost && winner === 'sebas' ? 0.9 : -0.3 - strain - kick.cami,
      arms: [0.9, 0.15], legs: [-0.45, 0.25]
    });
    Juegos.drawFigure(ctx, {
      who: 'sebas', face: faces.sebas, x: sebasX, feetY: ground, headH: headH,
      tilt: lost && winner === 'cami' ? -0.9 : 0.3 + strain + kick.sebas,
      arms: [0.15, 0.9], legs: [-0.25, 0.45]
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
