// Guest uploads to the couple's Google Drive accounts (see fotos-drive/).
// Each file goes to the first account with enough free space, so new
// accounts can be appended to DRIVES when the earlier ones fill up.
(function () {
  var DRIVES = [
    // tundamalabs@gmail.com
    'https://script.google.com/macros/s/AKfycbxaALBoAcs_ybhSXBV20pMh5KujwE1WBQt44FORsnqMq4D7EI29ffys7XXWENwJGSSJMg/exec',
    // contacto.tundamalabs@gmail.com
    'https://script.google.com/macros/s/AKfycbzQMJ2Z0QcpM3RQp7NEnPc0rSKYG76eyw5MJmuIZV9GMoZDmLRCzeq9PUg29dJYJ57Z/exec',
    // trashtomymail@gmail.com
    'https://script.google.com/macros/s/AKfycbwB2xOaJV_ZYGij3eIGRPnU2Twh7oiECYy-bBF4R_APzUrptnpVwRYfs3a0Zipwiy8MGg/exec'
  ];
  // Drive requires chunks in multiples of 256 KB; 8 MB keeps retries cheap on mobile data
  var CHUNK = 8 * 1024 * 1024;
  var RETRIES = 4;

  var picker = document.getElementById('picker');
  var sender = document.getElementById('sender');
  var hello = document.getElementById('hello');
  var input = document.getElementById('who');
  var box = document.getElementById('whoBox');
  var list = document.getElementById('whoList');
  var notMe = document.getElementById('notMe');
  var filesInput = document.getElementById('files');
  var uploads = document.getElementById('uploads');
  var summary = document.getElementById('summary');
  var guests = [];
  var queue = [];
  var running = false;
  var done = 0;
  var failed = 0;

  // ---------- Identity ----------
  function renderIdentity() {
    var guest = QR.me();
    picker.hidden = !!guest;
    sender.hidden = !guest;
    if (guest) hello.textContent = '¡Hola, ' + QR.firstName(guest.name) + '!';
  }

  function renderResults() {
    var matches = QR.search(guests, input.value);
    list.innerHTML = '';
    if (!matches) { box.hidden = true; return; }
    box.hidden = false;
    if (!matches.length) {
      list.innerHTML = '<li class="results-empty">No encontramos ese nombre. Prueba solo con tu apellido.</li>';
      return;
    }
    matches.forEach(function (g) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pick';
      btn.textContent = g.name;
      btn.addEventListener('click', function () {
        QR.setMe(g);
        input.value = '';
        box.hidden = true;
        renderIdentity();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  input.addEventListener('input', renderResults);
  notMe.addEventListener('click', function () {
    if (running) return;
    QR.setMe(null);
    renderIdentity();
    input.focus();
  });
  QR.loadGuests('../../juegos/invitados.json').then(function (data) {
    guests = data;
    if (input.value) renderResults();
  });
  renderIdentity();

  // ---------- Apps Script calls ----------
  function call(drive, payload) {
    // text/plain keeps it a simple request, so the browser skips the CORS preflight
    return fetch(drive, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // Retries a request a few times, so one dropped request does not skip an account
  function withRetry(run, tries) {
    return run().then(null, function (err) {
      if (tries <= 1) throw err;
      return wait(1500).then(function () { return withRetry(run, tries - 1); });
    });
  }

  function freeSpace(drive) {
    return withRetry(function () {
      return fetch(drive + '?action=info').then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) throw new Error('info');
        return d.free;
      });
    }, 3);
  }

  // Opens an upload session on the first account that has room for this file.
  // Every file starts again from the first account, so a passing failure never
  // moves the rest of the uploads to a later one.
  function startSession(file) {
    var guest = QR.me();
    var unreachable = false;
    function tryDrive(i) {
      if (i >= DRIVES.length) return Promise.reject(new Error(unreachable ? 'network' : 'full'));
      var drive = DRIVES[i];
      return freeSpace(drive).then(function (free) {
        if (free < file.size) return tryDrive(i + 1);
        return withRetry(function () {
          return call(drive, {
            action: 'start',
            guest: guest.id,
            name: file.name,
            mime: file.type,
            size: file.size,
            origin: location.origin
          });
        }, 2).then(function (res) {
          if (res.ok) return { drive: drive, url: res.url, total: file.size, relay: false };
          if (res.error === 'full') return tryDrive(i + 1);
          throw new Error(res.error);
        }, function () {
          unreachable = true;
          return tryDrive(i + 1);
        });
      }, function () {
        unreachable = true;
        return tryDrive(i + 1);
      });
    }
    return tryDrive(0);
  }

  // ---------- Chunk transport ----------
  // Every send resolves to { done, next }: next is the first byte Drive still needs.
  // Direct: the browser sends the bytes to Google. Relay: Apps Script forwards them.
  function putDirect(session, blob, start, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', session.url);
      xhr.setRequestHeader('Content-Range', 'bytes ' + start + '-' + (start + blob.size - 1) + '/' + session.total);
      xhr.upload.onprogress = function (e) { onProgress(e.loaded); };
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 201) return resolve({ done: true });
        if (xhr.status !== 308) return reject(new Error('drive-' + xhr.status));
        // Range is only readable if Google exposes it; otherwise ask through the relay
        var m = /bytes=0-(\d+)/.exec(xhr.getResponseHeader('Range') || '');
        if (m) return resolve({ done: false, next: Number(m[1]) + 1 });
        resolve(queryStatus(session));
      };
      xhr.onerror = function () { reject(new Error('network')); };
      xhr.send(blob);
    });
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function relayResult(res) {
    if (!res.ok) throw new Error(res.error);
    return { done: res.done, next: res.next };
  }

  function putRelay(session, blob, start, onProgress) {
    return toBase64(blob).then(function (data) {
      return call(session.drive, { action: 'chunk', url: session.url, start: start, total: session.total, data: data });
    }).then(function (res) {
      var out = relayResult(res);
      onProgress(blob.size);
      return out;
    });
  }

  function queryStatus(session) {
    return call(session.drive, { action: 'status', url: session.url, total: session.total }).then(relayResult);
  }

  // Network drops, rate limits and server errors are worth another try; an expired
  // or rejected session is not
  function retryable(err) {
    return err.message === 'network' || err.message === 'stalled' || /^drive-(5\d\d|429)$/.test(err.message) || err instanceof TypeError;
  }

  function sendFrom(session, file, start, onProgress) {
    var blob = file.slice(start, Math.min(start + CHUNK, file.size));
    var progress = function (loaded) { onProgress(start + loaded); };
    if (session.relay) return putRelay(session, blob, start, progress);
    return putDirect(session, blob, start, progress).then(null, function (err) {
      // This browser may be blocked from Google's upload URL; use the relay for this file
      // A drop while the app is in the background is not a reason to leave the direct path
      if (err.message !== 'network' || wasHidden || document.hidden) throw err;
      session.relay = true;
      return queryStatus(session).then(function (status) {
        if (status.done) return status;
        return sendFrom(session, file, status.next, onProgress);
      });
    });
  }

  // ---------- Background and app switching ----------
  // Phones pause the page when the guest switches apps. Failures while hidden do not
  // count as attempts: the upload waits until the page is visible and resumes from
  // the byte Drive last kept.
  var wasHidden = false;
  var wakeLock = null;

  function whenVisible() {
    if (!document.hidden) return Promise.resolve();
    return new Promise(function (resolve) {
      function onChange() {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', onChange);
        resolve();
      }
      document.addEventListener('visibilitychange', onChange);
    });
  }

  // Keeps the screen on while uploading so the phone does not lock mid-video
  function holdScreen(on) {
    if (!('wakeLock' in navigator)) return;
    if (on && !wakeLock && !document.hidden) {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }, function () { /* not allowed: uploads still work */ });
    } else if (!on && wakeLock) {
      wakeLock.release();
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { wasHidden = true; return; }
    if (running || queue.length) holdScreen(true);
    // Files that failed for network reasons get another chance when the guest comes back
    items.forEach(function (item) { if (item.failed && item.autoRetry) retry(item); });
  });

  // Continues an earlier session when there is one, otherwise opens a new one
  function openSession(item) {
    if (!item.session) {
      return startSession(item.file).then(function (session) {
        item.session = session;
        return { session: session, next: 0 };
      });
    }
    return queryStatus(item.session).then(function (status) {
      return { session: item.session, next: status.done ? null : status.next };
    }, function (err) {
      if (retryable(err)) throw err;
      // Expired or rejected session: start the file again
      item.session = null;
      return openSession(item);
    });
  }

  function uploadFile(item) {
    var file = item.file;
    return openSession(item).then(function (opened) {
      var session = opened.session;
      var attempt = 0;
      function step(start) {
        return sendFrom(session, file, start, function (sent) {
          item.setProgress(sent / file.size);
        }).then(function (res) {
          if (res.done) return;
          // No progress at all counts as a failed attempt, so a stuck session cannot loop forever
          if (!(res.next > start)) return recover(new Error('stalled'));
          attempt = 0;
          // Drive may keep less than a whole chunk; always continue from what it reports
          return step(res.next);
        }, recover);
      }
      function recover(err) {
        if (!retryable(err)) throw err;
        var paused = wasHidden || document.hidden;
        wasHidden = false;
        if (!paused) attempt++;
        if (attempt > RETRIES) throw err;
        return whenVisible().then(function () { return wait(1500 * Math.max(1, attempt)); })
          .then(function () { return queryStatus(session); })
          .then(function (status) { return status.done ? null : step(status.next); }, recover);
      }
      if (opened.next === null) return;
      item.setProgress(opened.next / file.size);
      return step(opened.next);
    });
  }

  // ---------- Queue and UI ----------
  var items = [];

  function sizeLabel(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 / 1024) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function addItem(file) {
    var li = document.createElement('li');
    li.className = 'up-item';
    li.innerHTML = '<div class="up-row"><span class="up-name"></span><span class="up-state">En espera</span>' +
      '<button class="up-retry" type="button" hidden>Reintentar</button></div>' +
      '<div class="up-bar"><span></span></div>';
    li.querySelector('.up-name').textContent = file.name + ' · ' + sizeLabel(file.size);
    uploads.appendChild(li);
    var bar = li.querySelector('.up-bar span');
    var state = li.querySelector('.up-state');
    var retryBtn = li.querySelector('.up-retry');
    var item = {
      file: file,
      session: null,
      failed: false,
      autoRetry: false,
      setProgress: function (p) {
        bar.style.width = Math.min(100, p * 100).toFixed(1) + '%';
        state.textContent = Math.floor(Math.min(1, p) * 100) + '%';
      },
      waiting: function () {
        li.classList.remove('is-failed');
        retryBtn.hidden = true;
        state.textContent = 'En espera';
      },
      finish: function (ok, message, canRetry) {
        li.classList.add(ok ? 'is-done' : 'is-failed');
        if (ok) bar.style.width = '100%';
        state.textContent = ok ? 'Listo' : message;
        retryBtn.hidden = ok || !canRetry;
      }
    };
    retryBtn.addEventListener('click', function () { retry(item); });
    items.push(item);
    return item;
  }

  function retry(item) {
    if (!item.failed) return;
    item.failed = false;
    item.autoRetry = false;
    failed--;
    item.waiting();
    queue.push(item);
    runQueue();
  }

  function renderSummary() {
    var pending = queue.length + (running ? 1 : 0);
    summary.hidden = false;
    retryAll.hidden = true;
    if (pending) {
      summaryText.textContent = 'Subiendo… Faltan ' + pending + '. Si cambias de app, al volver sigue donde iba.';
    } else if (failed) {
      summaryText.textContent = 'Subimos ' + done + '. ' + failed + (failed === 1 ? ' no se pudo subir.' : ' no se pudieron subir.');
      retryAll.hidden = !items.some(function (i) { return i.failed && i.canRetry; });
    } else {
      summaryText.textContent = '¡Gracias! Recibimos ' + done + (done === 1 ? ' archivo.' : ' archivos.');
    }
  }

  function errorMessage(err) {
    if (err.message === 'full') return 'Sin espacio';
    if (err.message === 'unknown-guest') return 'Elige tu nombre de nuevo';
    if (err.message === 'too-big') return 'Muy pesado';
    if (err.message === 'bad-type') return 'Solo fotos y videos';
    if (err.message === 'empty') return 'Archivo vacío';
    return 'No se pudo subir';
  }

  // These will fail the same way every time
  var FINAL_ERRORS = ['too-big', 'bad-type', 'empty', 'unknown-guest'];

  function runQueue() {
    if (running) return;
    var item = queue.shift();
    if (!item) { holdScreen(false); renderSummary(); return; }
    running = true;
    holdScreen(true);
    renderSummary();
    (item.file.size ? uploadFile(item) : Promise.reject(new Error('empty'))).then(function () {
      done++;
      item.finish(true);
    }, function (err) {
      failed++;
      item.failed = true;
      item.canRetry = FINAL_ERRORS.indexOf(err.message) === -1;
      item.autoRetry = item.canRetry && retryable(err);
      item.finish(false, errorMessage(err), item.canRetry);
    }).then(function () {
      running = false;
      runQueue();
    });
  }

  var retryAll = document.createElement('button');
  retryAll.type = 'button';
  retryAll.className = 'link-btn up-retry-all';
  retryAll.textContent = 'Reintentar todos';
  retryAll.hidden = true;
  var summaryText = document.createTextNode('');
  summary.appendChild(summaryText);
  summary.appendChild(retryAll);
  retryAll.addEventListener('click', function () {
    items.forEach(function (item) { if (item.failed && item.canRetry) retry(item); });
  });

  filesInput.addEventListener('change', function () {
    Array.prototype.forEach.call(filesInput.files, function (file) {
      queue.push(addItem(file));
    });
    filesInput.value = '';
    runQueue();
  });

  // Leaving mid-upload would cut the current file
  window.addEventListener('beforeunload', function (e) {
    if (running || queue.length) { e.preventDefault(); e.returnValue = ''; }
  });
})();
