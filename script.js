function parseGuests() {
  const ALLOWED_GUESTS = [
    "Mami", "Papi", "Gordo", "Mona+Andres", "Polita", "Nonita+Tia%20Ana+Valen",
    "Tia%20Rosa", "Mile+Mari+Tio%20Lucho", "Tia%20Claudia+Tio%20Carlos", "Aleja+Manu",
    "Isa+Puerquito", "Dani+Pablo", "Valen+Torres", "Lau+Clarito", "Oscar", "Migue",
    "Kata+Bohorquez", "Caballero%20Lopez", "Gabi+El%20Cruck", "Yinnis+Oscarin",
    "Lau+Steven", "Tatiana+Useche", "Mami+Papi", "Hermana%20Ali", "Heman-ia",
    "Daviiid", "Tia%20Teresa", "Tia%20Lucia", "Tio%20Cesar", "Moni+Majo+Jaun",
    "Santi", "Lore", "Mafe", "Kate", "Cami", "Majo+Daniel", "Caro+Daniel",
    "Nata+Jhon%20Mario", "Jorge", "Valen", "Diana+Juan%20Camilo", "Daniela+Alejo",
    "Angie+Nicolas", "Jose"
  ];

  const search = window.location.search;
  const invCard = document.getElementById('invCard');
  const signature = document.querySelector('.signature');
  const coverBottom = document.querySelector('.cover-bottom');

  const match = search.match(/[?&]to=([^&]*)/);
  const rawTo = match ? match[1] : null;

  // Validation: Only allow guests in the predefined list
  if (!rawTo || !ALLOWED_GUESTS.includes(rawTo)) {
    // If 'to' is present but not allowed, clean the URL
    if (rawTo) {
      const url = new URL(window.location);
      url.searchParams.delete('to');
      window.history.replaceState({}, '', url.pathname);
    }

    // Custom "No invited" state
    const coverImg = document.querySelector('.cover-img');
    const guestNamesEl = document.getElementById('guest-names');
    const reservaEl = document.getElementById('cover-reserva');
    const dateNumEl = document.querySelector('.cover-date-num');

    if (coverImg) coverImg.style.filter = 'brightness(0.15) grayscale(0.5)';
    if (guestNamesEl) guestNamesEl.style.display = 'none';
    if (dateNumEl) dateNumEl.style.display = 'none';
    if (reservaEl) {
      reservaEl.textContent = 'BODA ÍNTIMA (SOLO CON INVITACIÓN)';
      reservaEl.style.opacity = '1';
      reservaEl.style.color = 'rgba(255,255,255,0.7)';
    }

    // Hide everything except the hero title
    if (invCard) {
      const sections = invCard.children;
      for (let i = 1; i < sections.length; i++) {
        sections[i].style.display = 'none';
      }
    }
    if (signature) signature.style.display = 'none';
    if (coverBottom) coverBottom.style.display = 'block'; // Show only the modified footer
    return;
  }

  // Split by '+' which is our guest delimiter
  const names = rawTo.split('+').map(n => decodeURIComponent(n).trim()).filter(Boolean);

  if (names.length === 0) return;

  const guestNamesEl = document.getElementById('guest-names');
  const reservaEl = document.getElementById('cover-reserva');
  const esperamosEl = document.getElementById('esperamos-text');
  const intimaEl = document.getElementById('intima-text');

  let isPlural = false;
  let count = names.length;
  let finalName = names[0];

  if (count > 1) {
    isPlural = true;
    const items = [...names];
    const last = items.pop();
    finalName = items.join(', ') + ' y ' + last;
  }

  if (guestNamesEl) guestNamesEl.textContent = finalName;

  if (isPlural) {
    if (reservaEl) reservaEl.textContent = 'RESERVEN ESTA FECHA';
    if (esperamosEl) esperamosEl.innerHTML = 'Los esperamos para<br>celebrar nuestra boda';
    if (intimaEl) intimaEl.innerHTML = `${finalName}, hemos preparado una celebración íntima, muy nuestra, y nada nos haría más ilusión que compartirla con ustedes. <strong>Por eso, estas ${count} invitaciones son solo para ustedes y están pensadas exclusivamente para adultos.</strong>`;
  } else {
    // Singular
    if (reservaEl) reservaEl.textContent = 'RESERVA ESTA FECHA';
    if (esperamosEl) esperamosEl.innerHTML = 'Te esperamos para<br>celebrar nuestra boda';
    if (intimaEl) intimaEl.innerHTML = `${finalName}, hemos preparado una celebración íntima, muy nuestra, y nada nos haría más ilusión que compartirla contigo. <strong>Por eso, esta invitación es solo para ti y está pensada exclusivamente para adultos.</strong>`;
  }
}



// Countdown Logic
function setupCountdown() {
  const countdownEl = document.getElementById("countdown");
  if (!countdownEl) return;

  const targetDateStr = countdownEl.getAttribute("data-target-date");
  if (!targetDateStr) return;

  const targetDate = new Date(targetDateStr);
  if (Number.isNaN(targetDate.getTime())) return;

  const daysEl = document.getElementById("countdown-days");
  const hoursEl = document.getElementById("countdown-hours");
  const minutesEl = document.getElementById("countdown-minutes");
  const secondsEl = document.getElementById("countdown-seconds");

  function updateCountdown() {
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      daysEl.textContent = "0";
      hoursEl.textContent = "0";
      minutesEl.textContent = "0";
      secondsEl.textContent = "0";
      return;
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    daysEl.textContent = String(days);
    hoursEl.textContent = String(hours).padStart(2, "0");
    minutesEl.textContent = String(minutes).padStart(2, "0");
    secondsEl.textContent = String(seconds).padStart(2, "0");
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

function setupMusic() {
  const music = document.getElementById('bgMusic');
  const btn = document.getElementById('musicBtn');
  const control = document.getElementById('musicControl');
  const slider = document.getElementById('volumeSlider');

  if (!music || !btn) return;

  // Set initial state
  music.currentTime = 63;
  music.volume = 0.5;

  const playMusic = () => {
    music.play().then(() => {
      control.classList.add('music-playing');
    }).catch(err => {
      console.log("Autoplay waiting for interaction...");
    });
  };

  // 1. Try playing immediately
  playMusic();

  const togglePlay = () => {
    if (music.paused) {
      music.play();
      control.classList.add('music-playing');
    } else {
      music.pause();
      control.classList.remove('music-playing');
    }
  };

  let hideTimeout;
  const showSlider = () => {
    control.classList.add('expanded');
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      control.classList.remove('expanded');
    }, 3000);
  };

  btn.addEventListener('click', (e) => {
    togglePlay();
    showSlider();
  });

  slider.addEventListener('input', (e) => {
    music.volume = e.target.value;
    showSlider();
  });

  slider.addEventListener('change', showSlider);

  // 2. Interaction fallback (Reliable way for browsers)
  const startOnInteraction = () => {
    if (music.paused) {
      playMusic();
      window.removeEventListener('click', startOnInteraction);
      window.removeEventListener('scroll', startOnInteraction);
      window.removeEventListener('touchstart', startOnInteraction);
      window.removeEventListener('mousemove', startOnInteraction);
    }
  };

  window.addEventListener('click', startOnInteraction);
  window.addEventListener('scroll', startOnInteraction);
  window.addEventListener('touchstart', startOnInteraction);
  window.addEventListener('mousemove', startOnInteraction);
}

function init() {
  parseGuests();
  setupCountdown();
  setupMusic();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

