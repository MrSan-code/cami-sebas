// Fallback WhatsApp number (country code + digits) for the "mission accepted" message.
// Each page sets its own on the share link via data-phone; empty lets the guest pick the chat.
const WHATSAPP_NUMBER = '';

const NO_LABELS = [
  'No', '¿De verdad?', 'Piénsalo mejor', 'Casi…', 'Ni lo intentes',
  'Por aquí no es', 'Imposible', 'Sigue intentando', 'Nop'
];

const CONFETTI_COLORS = ['#5d101f', '#ab5823', '#707f75', '#b8a088', '#e0d6cb', '#c58b78'];

function handleLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  setTimeout(() => loader.classList.add('fade-out'), 1200);
}

function setupReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.2 });
  items.forEach(el => observer.observe(el));
}

function setupDodgingNo() {
  const zone = document.getElementById('answerZone');
  const yes = document.getElementById('btnYes');
  const no = document.getElementById('btnNo');
  const hint = document.getElementById('hint');
  if (!zone || !yes || !no) return;

  let dodges = 0;
  const GAP = 14;

  const overlaps = (a, b) =>
    !(a.right + GAP < b.left || a.left - GAP > b.right || a.bottom + GAP < b.top || a.top - GAP > b.bottom);

  // Jump to a random free spot inside the zone, away from the Yes button,
  // the current spot and (when known) the pointer that is chasing it.
  function dodge(pointerX, pointerY) {
    dodges += 1;
    no.textContent = NO_LABELS[dodges % NO_LABELS.length];
    yes.style.setProperty('--grow', Math.min(1 + dodges * 0.05, 1.35).toFixed(2));
    if (hint && dodges >= 3) hint.classList.add('show');

    const z = zone.getBoundingClientRect();
    const current = no.getBoundingClientRect();
    const yesRect = yes.getBoundingClientRect();
    const maxX = Math.max(0, z.width - current.width);
    const maxY = Math.max(0, z.height - current.height);

    let spot = null;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * maxX;
      const y = Math.random() * maxY;
      const rect = {
        left: z.left + x, top: z.top + y,
        right: z.left + x + current.width, bottom: z.top + y + current.height
      };
      if (overlaps(rect, yesRect)) continue;
      const cx = rect.left + current.width / 2;
      const cy = rect.top + current.height / 2;
      const farFromPointer = pointerX == null || Math.hypot(cx - pointerX, cy - pointerY) > 130;
      const farFromCurrent = Math.hypot(rect.left - current.left, rect.top - current.top) > 80;
      spot = { x, y };
      if (farFromPointer && farFromCurrent) break;
    }
    if (!spot) spot = { x: maxX * Math.random(), y: 0 };

    no.style.left = `${spot.x}px`;
    no.style.top = `${spot.y}px`;
  }

  // Desktop: run away before the cursor even arrives
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = no.getBoundingClientRect();
    const near = e.clientX > r.left - 40 && e.clientX < r.right + 40 &&
      e.clientY > r.top - 40 && e.clientY < r.bottom + 40;
    if (near) dodge(e.clientX, e.clientY);
  });

  // Touch: dodge on contact and swallow the tap so click never fires
  no.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    dodge(t.clientX, t.clientY);
  }, { passive: false });

  no.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    dodge(e.clientX, e.clientY);
  });

  no.addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    dodge();
  });

  no.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dodge();
    }
  });

  no.addEventListener('contextmenu', e => e.preventDefault());

  // Keep the button inside the zone if the layout changes
  window.addEventListener('resize', () => {
    const z = zone.getBoundingClientRect();
    const r = no.getBoundingClientRect();
    if (r.right > z.right || r.bottom > z.bottom) {
      no.style.left = `${Math.max(0, z.width - r.width)}px`;
      no.style.top = `${Math.max(0, z.height - r.height)}px`;
    }
  });
}

function launchConfetti(canvas) {
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const w = window.innerWidth;
  const pieces = Array.from({ length: 170 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: window.innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 14,
    vy: -(Math.random() * 13 + 7),
    size: Math.random() * 7 + 5,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    round: Math.random() < 0.3
  }));

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = elapsed > 3200 ? Math.max(0, 1 - (elapsed - 3200) / 1000) : 1;
    pieces.forEach(p => {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    });
    if (elapsed < 4200) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

function setupAccept() {
  const yes = document.getElementById('btnYes');
  const overlay = document.getElementById('accepted');
  const share = document.getElementById('btnShare');
  const close = document.getElementById('btnClose');
  if (!yes || !overlay) return;

  if (share) {
    const text = share.dataset.text || '';
    const phone = share.dataset.phone || WHATSAPP_NUMBER;
    share.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  yes.addEventListener('click', () => {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('show'));
    launchConfetti(document.getElementById('confetti'));
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    if (share) share.focus({ preventScroll: true });
  });

  const hide = () => {
    overlay.classList.remove('show');
    setTimeout(() => { overlay.hidden = true; }, 400);
  };
  if (close) close.addEventListener('click', hide);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) hide();
  });
}

function init() {
  handleLoader();
  setupReveal();
  setupDodgingNo();
  setupAccept();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
