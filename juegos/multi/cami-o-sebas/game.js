(function () {
  const VOTE_MS = 10000;
  const question = document.getElementById('question');
  const round = document.getElementById('round');
  const timer = document.getElementById('timer');
  const you = document.getElementById('you');
  const board = document.getElementById('board');
  const stage = document.getElementById('stage');
  const buttons = document.querySelectorAll('[data-vote]');
  const parts = {
    cami: { pct: document.getElementById('pctCami'), fill: document.getElementById('fillCami'), who: document.getElementById('whoCami') },
    sebas: { pct: document.getElementById('pctSebas'), fill: document.getElementById('fillSebas'), who: document.getElementById('whoSebas') }
  };

  let myVote = null;
  let votingOn = -1; // question index the local vote belongs to
  let revealed = -1;
  let stageEnds = 0;

  const sala = Sala.open({ game: 'cami-o-sebas', render: render });

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const state = sala.state();
      if (!state || state.phase !== 'playing' || state.g.stage !== 'vote') return;
      myVote = btn.dataset.vote;
      sala.send({ t: 'vote', v: myVote });
      Juegos.sfx('flip');
      render(state, sala.me());
    });
  });

  // The bar drains locally between server messages
  setInterval(function () {
    const state = sala.state();
    const voting = state && state.phase === 'playing' && state.g.stage === 'vote';
    timer.style.setProperty('--p', voting ? Math.max(0, (stageEnds - performance.now()) / VOTE_MS) : 0);
  }, 100);

  function clearParts() {
    Object.keys(parts).forEach(function (side) {
      parts[side].pct.textContent = '';
      parts[side].who.textContent = '';
      parts[side].fill.style.height = '0%';
    });
  }

  // Top three so far, shown between questions
  function renderBoard(state, me) {
    board.textContent = '';
    state.players.slice().sort(function (a, b) {
      return b.score - a.score;
    }).slice(0, 3).forEach(function (p, i) {
      const li = document.createElement('li');
      if (me && p.id === me.id) li.className = 'is-me';
      li.appendChild(sala.avatar(p));
      const name = document.createElement('span');
      name.textContent = (i + 1) + '. ' + p.name.split(' ')[0] + (p.streak >= 3 ? ' · racha ' + p.streak : '');
      const score = document.createElement('b');
      score.textContent = p.score;
      li.appendChild(name);
      li.appendChild(score);
      board.appendChild(li);
    });
  }

  function render(state, me) {
    const g = state.g;
    const playing = state.phase === 'playing' && g.q;
    if (!playing) {
      question.textContent = '';
      round.textContent = '';
      you.textContent = '';
      board.textContent = '';
      buttons.forEach(function (btn) {
        btn.disabled = true;
        btn.className = 'vote-btn';
      });
      clearParts();
      votingOn = revealed = -1;
      return;
    }
    if (g.idx !== votingOn) {
      votingOn = g.idx;
      myVote = null;
      Juegos.sfx('tick');
      question.classList.remove('is-in');
      void question.offsetWidth; // replay the entrance for every new question
      question.classList.add('is-in');
    }
    stageEnds = performance.now() + g.left;
    round.textContent = 'Pregunta ' + (g.idx + 1) + ' de ' + g.total;
    question.textContent = g.q;

    const reveal = g.stage === 'reveal';
    const total = reveal ? g.counts.cami + g.counts.sebas : 0;
    buttons.forEach(function (btn) {
      const v = btn.dataset.vote;
      btn.disabled = reveal;
      btn.className = 'vote-btn' + (myVote === v ? ' is-mine' : '') + (reveal ? ' is-reveal' : '') +
        (reveal && (g.majority === v || g.majority === 'empate') ? ' is-majority' : '');
      if (reveal) {
        const share = total ? Math.round(g.counts[v] / total * 100) : 0;
        parts[v].pct.textContent = share + '%';
        parts[v].fill.style.height = share + '%';
        parts[v].who.textContent = g.voters[v].join(', ') + (g.counts[v] > g.voters[v].length ? '…' : '');
      }
    });
    if (!reveal) clearParts();

    if (reveal) {
      if (revealed !== g.idx) {
        revealed = g.idx;
        Juegos.sfx(me && me.hit ? 'match' : 'miss');
        if (g.unanimous) Juegos.confetti(stage);
      }
      const streak = me && me.streak >= 3 ? ' ¡Racha de ' + me.streak + ', vale doble!' : '';
      you.textContent = g.unanimous ? '¡Casi unánime!' + streak
        : !myVote ? 'No alcanzaste a votar.'
          : me && me.hit ? '¡Con la mayoría!' + streak : 'Esta vez fuiste minoría.';
      renderBoard(state, me);
    } else {
      board.textContent = '';
      you.textContent = (myVote ? 'Voto enviado. ' : 'Toca una cara para votar. ') + g.voted + ' de ' + state.players.length + ' ya votaron';
    }
  }
})();
