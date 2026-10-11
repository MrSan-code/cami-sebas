(function () {
  const DIR = '../../assets/juegos/vestir/';
  const EXPORT_W = 900;
  const EXPORT_H = 1200;

  // Where things go on each cutout, as fractions of the face image.
  // `width` is the face width relative to the figure; the *W values size each kind of accessory
  // (in face widths).
  const FACES = {
    sebas: {
      label: 'Sebas', src: '../../assets/juegos/sebas.webp', ratio: 320 / 235, width: 0.54, tilt: -11,
      head: { x: 0.40, y: 0.13 }, eyes: { x: 0.40, y: 0.45 }, nose: { x: 0.41, y: 0.58 },
      lip: { x: 0.45, y: 0.655 }, neck: { x: 0.66, y: 0.97 },
      headW: 0.98, veilW: 1.3, eyesW: 0.66, lipW: 0.44, noseW: 0.2, neckW: 0.5
    },
    cami: {
      label: 'Cami', src: '../../assets/juegos/cami.webp', ratio: 320 / 293, width: 0.66, tilt: -8,
      head: { x: 0.50, y: 0.11 }, eyes: { x: 0.53, y: 0.375 }, nose: { x: 0.555, y: 0.45 },
      lip: { x: 0.56, y: 0.515 }, neck: { x: 0.56, y: 0.86 },
      headW: 0.74, veilW: 1.5, eyesW: 0.5, lipW: 0.3, noseW: 0.15, neckW: 0.38
    }
  };

  // ratio = height / width of the drawing; origin = the point of the drawing that sits on the anchor.
  // Only one item per group can be worn at a time.
  const ITEMS = [
    { id: 'copa', name: 'Sombrero de copa', group: 'hat', anchor: 'head', scale: 1, ratio: 84 / 120, origin: [0.5, 0.9] },
    { id: 'corona', name: 'Corona', group: 'hat', anchor: 'head', scale: 0.8, ratio: 84 / 120, origin: [0.5, 0.92] },
    { id: 'gorro', name: 'Gorro de fiesta', group: 'hat', anchor: 'head', scale: 0.62, ratio: 100 / 120, origin: [0.5, 0.94] },
    { id: 'flores', name: 'Corona de flores', group: 'hat', anchor: 'head', scale: 0.98, ratio: 46 / 130, origin: [0.5, 0.6] },
    { id: 'velo', name: 'Velo', group: 'hat', anchor: 'head', size: 'veilW', scale: 1, ratio: 150 / 140, origin: [0.5, 0.16], behind: true },
    { id: 'redondas', name: 'Gafas redondas', group: 'glasses', anchor: 'eyes', scale: 1, ratio: 46 / 120, origin: [0.5, 0.5] },
    { id: 'sol', name: 'Gafas de sol', group: 'glasses', anchor: 'eyes', scale: 1, ratio: 46 / 120, origin: [0.5, 0.45] },
    { id: 'corazon', name: 'Gafas de corazón', group: 'glasses', anchor: 'eyes', scale: 1.02, ratio: 46 / 120, origin: [0.5, 0.45] },
    { id: 'bigote', name: 'Bigote', group: 'lip', anchor: 'lip', scale: 1, ratio: 40 / 120, origin: [0.5, 0.45] },
    { id: 'nariz', name: 'Nariz de payaso', group: 'nose', anchor: 'nose', scale: 1, ratio: 1, origin: [0.5, 0.5] },
    { id: 'corbatin', name: 'Corbatín', group: 'neck', anchor: 'neck', scale: 1, ratio: 54 / 110, origin: [0.5, 0.5] }
  ];

  const figure = document.getElementById('figure');
  const faceImg = document.getElementById('face');
  const tray = document.getElementById('tray');
  const status = document.getElementById('status');
  const selfieInput = document.getElementById('selfieInput');
  const retakeBtn = document.getElementById('retakeBtn');
  const camera = document.getElementById('camera');
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraMsg = document.getElementById('cameraMsg');
  const shootBtn = document.getElementById('shootBtn');

  let who = 'sebas';
  // id -> { el, dx, dy }: what is being worn, with the offset the player dragged it by (fractions of the figure width)
  const worn = {};
  const itemImages = {};

  ITEMS.forEach(function (item) {
    const img = new Image();
    img.src = DIR + item.id + '.svg';
    itemImages[item.id] = img;
  });

  // Face box inside a figure of the given size
  function faceBox(figW, figH) {
    const face = FACES[who];
    const w = figW * face.width;
    const h = w * face.ratio;
    return { x: (figW - w) / 2, y: figH * 0.29, w: w, h: h };
  }

  // Position of an item in a figure of the given size: used for the screen and for the exported photo
  function place(item, offset, figW, figH) {
    const face = FACES[who];
    const box = faceBox(figW, figH);
    const w = box.w * face[item.size || item.anchor + 'W'] * item.scale;
    const h = w * item.ratio;
    const anchor = face[item.anchor];
    return {
      w: w,
      h: h,
      // Top-left corner, so the item's origin point lands on the anchor
      x: box.x + anchor.x * box.w - item.origin[0] * w + offset.dx * figW,
      y: box.y + anchor.y * box.h - item.origin[1] * h + offset.dy * figW,
      pivotX: item.origin[0] * w,
      pivotY: item.origin[1] * h,
      tilt: face.tilt
    };
  }

  function layout() {
    const figW = figure.clientWidth;
    const figH = figure.clientHeight;
    const box = faceBox(figW, figH);
    faceImg.style.left = box.x + 'px';
    faceImg.style.top = box.y + 'px';
    faceImg.style.width = box.w + 'px';
    faceImg.style.height = box.h + 'px';

    ITEMS.forEach(function (item) {
      const entry = worn[item.id];
      if (!entry) return;
      const p = place(item, entry, figW, figH);
      entry.el.style.left = p.x + 'px';
      entry.el.style.top = p.y + 'px';
      entry.el.style.width = p.w + 'px';
      entry.el.style.height = p.h + 'px';
      entry.el.style.transformOrigin = p.pivotX + 'px ' + p.pivotY + 'px';
      entry.el.style.transform = 'rotate(' + p.tilt + 'deg)';
    });
  }

  function renderTray() {
    tray.querySelectorAll('.dress-pick').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(!!worn[btn.dataset.id]));
    });
    document.querySelectorAll('[data-face]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.face === who));
    });
    retakeBtn.hidden = who !== 'selfie';
  }

  function takeOff(id) {
    if (!worn[id]) return;
    worn[id].el.remove();
    delete worn[id];
  }

  function makeDraggable(item, entry) {
    let from = null;
    entry.el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      entry.el.setPointerCapture(e.pointerId);
      from = { x: e.clientX, y: e.clientY, dx: entry.dx, dy: entry.dy };
    });
    entry.el.addEventListener('pointermove', function (e) {
      if (!from) return;
      const figW = figure.clientWidth;
      entry.dx = from.dx + (e.clientX - from.x) / figW;
      entry.dy = from.dy + (e.clientY - from.y) / figW;
      layout();
    });
    const drop = function () {
      from = null;
    };
    entry.el.addEventListener('pointerup', drop);
    entry.el.addEventListener('pointercancel', drop);
  }

  function putOn(item) {
    ITEMS.forEach(function (other) {
      if (other.group === item.group) takeOff(other.id);
    });
    const el = document.createElement('img');
    el.className = 'dress-item' + (item.behind ? ' is-behind' : '');
    el.src = DIR + item.id + '.svg';
    el.alt = item.name;
    el.draggable = false;
    const entry = { el: el, dx: 0, dy: 0 };
    worn[item.id] = entry;
    figure.appendChild(el);
    makeDraggable(item, entry);
  }

  function toggle(item) {
    if (worn[item.id]) takeOff(item.id);
    else putOn(item);
    Juegos.sfx('flip');
    status.textContent = '';
    layout();
    renderTray();
  }

  function clearAll() {
    Object.keys(worn).forEach(takeOff);
  }

  function randomLook() {
    clearAll();
    const groups = {};
    ITEMS.forEach(function (item) {
      (groups[item.group] = groups[item.group] || []).push(item);
    });
    Object.keys(groups).forEach(function (group) {
      // Hats almost always, the rest about half the time, so every roll looks different
      if (Math.random() < (group === 'hat' ? 0.9 : 0.55)) {
        const options = groups[group];
        putOn(options[Math.floor(Math.random() * options.length)]);
      }
    });
    Juegos.sfx('bonus');
    status.textContent = '';
    layout();
    renderTray();
  }

  function setFace(name) {
    who = name;
    faceImg.src = FACES[name].src;
    faceImg.alt = FACES[name].label;
    // Dragged offsets were for the other face
    Object.keys(worn).forEach(function (id) {
      worn[id].dx = worn[id].dy = 0;
    });
    layout();
    renderTray();
  }

  function drawItem(ctx, item) {
    const p = place(item, worn[item.id], EXPORT_W, EXPORT_H);
    ctx.save();
    ctx.translate(p.x + p.pivotX, p.y + p.pivotY);
    ctx.rotate(p.tilt * Math.PI / 180);
    ctx.drawImage(itemImages[item.id], -p.pivotX, -p.pivotY, p.w, p.h);
    ctx.restore();
  }

  // Same geometry as the screen, drawn on a canvas so it can be saved as a photo
  function renderPhoto() {
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');

    const sky = ctx.createLinearGradient(0, 0, 0, EXPORT_H);
    sky.addColorStop(0, '#e0d6cb');
    sky.addColorStop(0.75, '#fbf8f3');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
    ctx.strokeStyle = 'rgba(93, 16, 31, .35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, EXPORT_W - 56, EXPORT_H - 56);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(42, 42, EXPORT_W - 84, EXPORT_H - 84);

    const wornItems = ITEMS.filter(function (item) {
      return worn[item.id];
    });
    wornItems.filter(function (item) {
      return item.behind;
    }).forEach(function (item) {
      drawItem(ctx, item);
    });
    const box = faceBox(EXPORT_W, EXPORT_H);
    ctx.drawImage(faceImg, box.x, box.y, box.w, box.h);
    wornItems.filter(function (item) {
      return !item.behind;
    }).forEach(function (item) {
      drawItem(ctx, item);
    });

    ctx.fillStyle = '#ab5823';
    ctx.font = '600 30px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('C A M I  &  S E B A S  ·  1 4 . 1 1 . 2 0 2 6', EXPORT_W / 2, EXPORT_H - 84);
    return canvas;
  }

  function savePhoto() {
    // The face may still be loading right after switching between Sebas and Cami
    if (!faceImg.complete || !faceImg.naturalWidth) {
      faceImg.addEventListener('load', savePhoto, { once: true });
      return;
    }
    renderPhoto().toBlob(function (blob) {
      if (!blob) return;
      const file = new File([blob], 'cami-y-sebas.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        const caption = who === 'selfie' ? 'Así voy a la boda de Cami & Sebas.' : 'Así va ' + FACES[who].label + ' a la boda.';
        navigator.share({ files: [file], text: caption }).catch(function () { });
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
      setTimeout(function () {
        URL.revokeObjectURL(link.href);
      }, 2000);
      status.textContent = 'Foto guardada en tus descargas.';
    }, 'image/png');
  }

  ITEMS.forEach(function (item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dress-pick';
    btn.dataset.id = item.id;
    btn.setAttribute('aria-label', item.name);
    btn.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img');
    img.src = DIR + item.id + '.svg';
    img.alt = '';
    btn.appendChild(img);
    btn.addEventListener('click', function () {
      toggle(item);
    });
    tray.appendChild(btn);
  });

  // A guest's own photo: cut out on the device, then dressed like the couple
  function useSelfie(file) {
    status.textContent = 'Recortando tu foto… La primera vez tarda un poco.';
    window.Selfie.cutOut(file).then(function (face) {
      FACES.selfie = face;
      setFace('selfie');
      Juegos.sfx('bonus');
      status.textContent = 'Listo. Tu foto no sale de tu teléfono.';
    }).catch(function (error) {
      status.textContent = error && error.code === 'no-face'
        ? 'No encontré una cara. Prueba con otra foto, de frente y con buena luz.'
        : 'No se pudo preparar el recorte. Revisa tu conexión e inténtalo de nuevo.';
    });
  }

  // ---- Camera: a live preview inside the page, with the photo library as the other way in ----
  let stream = null;

  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
    stream = null;
    cameraVideo.srcObject = null;
    camera.hidden = true;
  }

  function openCamera() {
    camera.hidden = false;
    shootBtn.hidden = true;
    cameraMsg.textContent = 'Abriendo la cámara…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraMsg.textContent = 'Este navegador no deja usar la cámara aquí. Elige una foto de tu galería.';
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    }).then(function (media) {
      if (camera.hidden) {
        // Cancelled while the permission prompt was up
        media.getTracks().forEach(function (track) {
          track.stop();
        });
        return;
      }
      stream = media;
      cameraVideo.srcObject = media;
      cameraMsg.textContent = '';
      shootBtn.hidden = false;
      return cameraVideo.play();
    }).catch(function () {
      cameraMsg.textContent = 'No pude abrir la cámara. Revisa el permiso, o elige una foto de tu galería.';
    });
  }

  function shoot() {
    const w = cameraVideo.videoWidth;
    const h = cameraVideo.videoHeight;
    if (!w || !h) return;
    const frame = document.createElement('canvas');
    frame.width = w;
    frame.height = h;
    const ctx = frame.getContext('2d');
    // Mirrored, to match the preview the guest posed in front of
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraVideo, 0, 0, w, h);
    frame.toBlob(function (blob) {
      closeCamera();
      if (blob) useSelfie(blob);
    }, 'image/jpeg', 0.92);
  }

  shootBtn.addEventListener('click', shoot);
  document.getElementById('galleryBtn').addEventListener('click', function () {
    selfieInput.click();
  });
  document.getElementById('cameraCancel').addEventListener('click', closeCamera);
  // Don't leave the camera light on if the guest switches apps
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && stream) closeCamera();
  });

  selfieInput.addEventListener('change', function () {
    if (selfieInput.files && selfieInput.files[0]) {
      closeCamera();
      useSelfie(selfieInput.files[0]);
    }
    selfieInput.value = ''; // so picking the same photo again still fires
  });
  retakeBtn.addEventListener('click', openCamera);

  document.querySelectorAll('[data-face]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.face === 'selfie' && !FACES.selfie) {
        openCamera();
        return;
      }
      setFace(btn.dataset.face);
      status.textContent = '';
      Juegos.sfx('flip');
    });
  });
  document.getElementById('randomBtn').addEventListener('click', randomLook);
  document.getElementById('clearBtn').addEventListener('click', function () {
    clearAll();
    status.textContent = '';
    renderTray();
  });
  document.getElementById('saveBtn').addEventListener('click', savePhoto);

  window.addEventListener('resize', layout);
  faceImg.addEventListener('load', layout);
  setFace('sebas');
  // Start with a look on, so the page shows what it is for
  putOn(ITEMS[0]);
  putOn(ITEMS[5]);
  layout();
  renderTray();
})();
