function parseGuests() {
  const params = new URLSearchParams(window.location.search);
  let toStr = params.get('to');

  if (!toStr) return; // No names provided

  const names = toStr.trim().split(/\s+/).filter(Boolean);
  if (names.length === 0) return;

  const guestNamesEl = document.getElementById('guest-names');
  const reservaEl = document.getElementById('cover-reserva');
  const esperamosEl = document.getElementById('esperamos-text');
  const intimaEl = document.getElementById('intima-text');

  let finalName = names[0];
  let isPlural = false;
  let count = names.length;

  if (count > 1) {
    isPlural = true;
    const last = names.pop();
    finalName = names.join(', ') + ' y ' + last;
  }

  if (guestNamesEl) guestNamesEl.textContent = finalName;

  if (isPlural) {
    if (reservaEl) reservaEl.textContent = 'RESERVEN ESTA FECHA';
    if (esperamosEl) esperamosEl.innerHTML = 'Los esperamos para<br>celebrar nuestra boda';
    if (intimaEl) intimaEl.innerHTML = `${finalName}, esta invitación es muy especial.<br>Hemos preparado una celebración íntima,<br>por lo que estas ${count} invitaciones son intransferibles.`;
  } else {
    // Singular
    if (reservaEl) reservaEl.textContent = 'RESERVA ESTA FECHA';
    if (esperamosEl) esperamosEl.innerHTML = 'Te esperamos para<br>celebrar nuestra boda';
    if (intimaEl) intimaEl.innerHTML = `${finalName}, esta invitación es muy especial.<br>Hemos preparado una celebración íntima,<br>por lo que la invitación es intransferible.`;
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

function init() {
  parseGuests();
  setupCountdown();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
