(function () {
  const pad = document.getElementById('pad');
  const padText = document.getElementById('padText');
  const padSub = document.getElementById('padSub');
  const round = document.getElementById('round');
  const dots = document.getElementById('dots');
  const list = document.getElementById('roundList');

  let lastStage = '';
  let lastDecoy = '';

  const sala = Sala.open({ game: 'reflejos', render: render });

  pad.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    const state = sala.state();
    if (!state || state.phase !== 'playing' || state.g.stage === 'show') return;
    sala.send({ t: 'react' });
    if (navigator.vibrate) navigator.vibrate(15);
  });

  function renderDots(g) {
    dots.textContent = '';
    for (let i = 0; i < g.total; i++) {
      const dot = document.createElement('i');
      if (i < g.round) dot.className = 'is-done';
      else if (i === g.round) dot.className = 'is-now';
      dots.appendChild(dot);
    }
  }

  function render(state, me) {
    const g = state.g;
    list.textContent = '';
    if (state.phase !== 'playing' || !g.stage) {
      pad.dataset.stage = 'idle';
      padText.textContent = 'Espera…';
      padSub.textContent = '';
      round.textContent = '';
      dots.textContent = '';
      lastStage = lastDecoy = '';
      return;
    }
    renderDots(g);
    round.textContent = 'Ronda ' + (g.round + 1) + ' de ' + g.total + (me ? ' · llevas ' + me.score : '');
    const key = g.round + g.stage;
    if (key !== lastStage) {
      lastStage = key;
      if (g.stage === 'go') Juegos.sfx('go');
      if (g.stage === 'show') Juegos.sfx('match');
    }
    // A look-alike word flashing by: it must not be tapped
    if (g.decoy && g.decoy !== lastDecoy) Juegos.sfx('tick');
    lastDecoy = g.decoy || '';

    if (me && me.early && g.stage !== 'show') {
      pad.dataset.stage = 'early';
      padText.textContent = '¡Caíste!';
      padSub.textContent = 'Esta ronda la miras desde la barra.';
    } else if (g.stage === 'wait' && g.decoy) {
      pad.dataset.stage = 'decoy';
      padText.textContent = g.decoy;
      padSub.textContent = '';
    } else if (g.stage === 'wait') {
      pad.dataset.stage = 'wait';
      padText.textContent = 'Espera…';
      padSub.textContent = 'Solo vale “¡Salud!”';
    } else if (g.stage === 'go') {
      pad.dataset.stage = me && me.ms ? 'done' : 'go';
      padText.textContent = me && me.ms ? me.ms + ' ms' : '¡Salud!';
      padSub.textContent = me && me.ms ? 'Esperando a los demás…' : '¡Toca ya!';
    } else {
      pad.dataset.stage = 'show';
      padText.textContent = me && me.ms ? me.ms + ' ms' : me && me.early ? 'Caíste' : 'Sin tocar';
      padSub.textContent = (g.results.length ? 'Ganó ' + g.results[0].name.split(' ')[0] : 'Nadie alcanzó a brindar') +
        (g.fooled ? ' · ' + g.fooled + (g.fooled === 1 ? ' cayó' : ' cayeron') + ' en la trampa' : '');
      const slowest = g.results.length ? g.results[g.results.length - 1].ms : 1;
      g.results.forEach(function (r, i) {
        const li = document.createElement('li');
        li.className = 'podium-row reflex-row' + (me && r.id === me.id ? ' is-me' : '');
        li.dataset.pos = i + 1;
        // Bar length shows how each time compares with the others
        li.style.setProperty('--w', Math.round(r.ms / slowest * 100) + '%');
        [['podium-pos', i + 1], ['podium-name', r.name], ['podium-score', r.ms + ' ms']].forEach(function (cell) {
          const span = document.createElement('span');
          span.className = cell[0];
          span.textContent = cell[1];
          li.appendChild(span);
        });
        list.appendChild(li);
      });
    }
  }
})();
