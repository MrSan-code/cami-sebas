(function () {
  const GAME = 'memoria';
  const PHOTOS = ['1', '2', '3', '5', '6', '7', '8', '9'];
  const DEAL_MS = 1000;
  const PREVIEW_MS = 1900;
  const FLIP_BACK_MS = 950;

  // Picked by the lowest `max` the attempts fit in
  const RATINGS = [
    { max: 11, stars: 3, text: 'Memoria de elefante. Sospechamos que hiciste trampa.' },
    { max: 15, stars: 3, text: 'Muy bien. Tú sí te vas a acordar del aniversario.' },
    { max: 21, stars: 2, text: 'Nada mal, nada mal.' },
    { max: Infinity, stars: 1, text: 'Menos mal que los votos no te tocan a ti.' }
  ];

  const stage = document.getElementById('stage');
  const grid = document.getElementById('grid');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const progressEl = document.getElementById('progress');
  const startPanel = document.getElementById('startPanel');
  const overPanel = document.getElementById('overPanel');

  let attempts = 0;
  let matched = 0;
  let open = [];
  let locked = true;
  let startedAt = 0;
  let clockTimer = 0;
  let round = 0; // invalidates timers left over from a previous round

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function buildCard(photo, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'memory-card';
    card.dataset.photo = photo;
    card.style.setProperty('--i', index);
    card.setAttribute('aria-label', 'Carta ' + (index + 1));
    card.innerHTML =
      '<span class="memory-inner">' +
      '<span class="memory-back"><img src="../../assets/Logo.webp" alt=""></span>' +
      '<span class="memory-front"><img src="../../assets/juegos/memoria/' + photo + '.webp" alt=""></span>' +
      '</span>';
    card.addEventListener('click', function () {
      flip(card);
    });
    return card;
  }

  function deal() {
    grid.textContent = '';
    shuffle(PHOTOS.concat(PHOTOS)).forEach(function (photo, i) {
      grid.appendChild(buildCard(photo, i));
    });
  }

  function setAll(isOpen) {
    grid.querySelectorAll('.memory-card').forEach(function (card) {
      card.classList.toggle('is-open', isOpen);
    });
    Juegos.sfx('flip');
  }

  function start() {
    const mine = ++round;
    attempts = 0;
    matched = 0;
    open = [];
    locked = true;
    clearInterval(clockTimer);
    scoreEl.textContent = '0';
    timeEl.textContent = '0:00';
    progressEl.style.setProperty('--p', 0);
    startPanel.hidden = true;
    overPanel.hidden = true;
    deal();

    // Deal, show every card for a moment, then hide them and start the clock
    setTimeout(function () {
      if (mine !== round) return;
      setAll(true);
      setTimeout(function () {
        if (mine !== round) return;
        setAll(false);
        locked = false;
        startedAt = Date.now();
        clockTimer = setInterval(function () {
          timeEl.textContent = formatTime(Date.now() - startedAt);
        }, 250);
      }, PREVIEW_MS);
    }, DEAL_MS);
  }

  function flip(card) {
    if (locked || card.classList.contains('is-open') || card.classList.contains('is-matched')) return;
    card.classList.add('is-open');
    Juegos.sfx('flip');
    open.push(card);
    if (open.length < 2) return;

    attempts++;
    scoreEl.textContent = attempts;
    const pair = open;
    open = [];

    if (pair[0].dataset.photo === pair[1].dataset.photo) {
      pair.forEach(function (c) {
        c.classList.add('is-matched');
        c.disabled = true;
      });
      matched++;
      progressEl.style.setProperty('--p', matched / PHOTOS.length);
      Juegos.sfx('match');
      if (navigator.vibrate) navigator.vibrate(30);
      if (matched === PHOTOS.length) {
        locked = true;
        clearInterval(clockTimer);
        const elapsed = Date.now() - startedAt;
        setTimeout(function () {
          win(elapsed);
        }, 750);
      }
      return;
    }

    const mine = round;
    locked = true;
    pair.forEach(function (c) {
      c.classList.add('is-wrong');
    });
    Juegos.sfx('miss');
    setTimeout(function () {
      if (mine !== round) return;
      pair.forEach(function (c) {
        c.classList.remove('is-open', 'is-wrong');
      });
      locked = false;
    }, FLIP_BACK_MS);
  }

  function win(elapsed) {
    const rating = RATINGS.find(function (r) {
      return attempts <= r.max;
    });
    timeEl.textContent = formatTime(elapsed);
    Juegos.finish({
      game: GAME,
      score: attempts,
      lowerIsBetter: true,
      win: true,
      stars: rating.stars,
      title: 'Intentos · ' + formatTime(elapsed),
      verdict: rating.text
    });
  }

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);
  document.getElementById('shareBtn').addEventListener('click', function () {
    Juegos.share('Encontré todas las parejas en ' + attempts +
      ' intentos en el juego de la boda de Cami & Sebas. ¿Me superas?');
  });

  // Face-down board behind the start panel so the page isn't empty
  deal();
})();
