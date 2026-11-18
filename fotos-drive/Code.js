// Guest photo uploads for camiysebas.online, stored in this account's Drive.
// Each Google account deploys its own copy; the site fills them in order and
// moves on to the next one when this account's storage runs out.

var FOLDER_NAME = 'Fotos boda Cami & Sebas';
var GUESTS_URL = 'https://camiysebas.online/juegos/invitados.json';
var ALLOWED_ORIGINS = ['https://camiysebas.online', 'http://localhost:8811'];
var CHUNK_LIMIT = 40 * 1024 * 1024;
// Abuse limits for the anonymous endpoint
var MAX_FILE = 5 * 1024 * 1024 * 1024;
var DAILY_BYTES = 10 * 1024 * 1024 * 1024;
var DAILY_FILES_PER_GUEST = 600;
var UPLOAD_URL = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?[\w=&-]*upload_id=[\w-]+[\w=&-]*$/;

// Run once from the editor: grants Drive access and creates the folder
function setup() {
  var folder = rootFolder();
  Logger.log('Folder ready: ' + folder.getUrl());
  Logger.log('Free bytes: ' + freeBytes());
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'info') return json({ ok: true, free: freeBytes() });
  return json({ ok: true });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'start') return json(startUpload(body));
    if (body.action === 'chunk') return json(sendChunk(body));
    if (body.action === 'status') return json(uploadStatus(body));
    return json({ ok: false, error: 'unknown-action' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// Opens a Drive resumable upload session inside the guest's subfolder
function startUpload(body) {
  var guest = findGuest(body.guest);
  if (!guest) return { ok: false, error: 'unknown-guest' };
  var size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: 'bad-size' };
  if (size > MAX_FILE) return { ok: false, error: 'too-big' };
  var mime = String(body.mime || '');
  if (mime && !/^(image|video)\//.test(mime)) return { ok: false, error: 'bad-type' };
  if (size > freeBytes()) return { ok: false, error: 'full' };
  if (!reserveQuota(guest.id, size)) return { ok: false, error: 'limit' };

  var folder = guestFolder(guest.name);
  var origin = ALLOWED_ORIGINS.indexOf(body.origin) !== -1 ? body.origin : ALLOWED_ORIGINS[0];
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mime || 'application/octet-stream',
      'X-Upload-Content-Length': String(size),
      // Lets the browser send the bytes straight to Google from this origin
      Origin: origin
    },
    payload: JSON.stringify({ name: safeName(body.name), parents: [folder.getId()] }),
    muteHttpExceptions: true
  });
  var url = res.getHeaders().Location || res.getHeaders().location;
  if (!url) return { ok: false, error: 'drive-' + res.getResponseCode() };
  return { ok: true, url: url };
}

// Fallback when the browser cannot reach the upload URL directly: relays one chunk
function sendChunk(body) {
  if (!UPLOAD_URL.test(String(body.url))) return { ok: false, error: 'bad-url' };
  var start = Number(body.start);
  var total = Number(body.total);
  if (!Number.isInteger(start) || !Number.isInteger(total) || start < 0 || total <= 0) {
    return { ok: false, error: 'bad-range' };
  }
  var bytes = Utilities.base64Decode(body.data);
  if (!bytes.length || bytes.length > CHUNK_LIMIT || start + bytes.length > total) {
    return { ok: false, error: 'bad-range' };
  }
  var res = UrlFetchApp.fetch(body.url, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + start + '-' + (start + bytes.length - 1) + '/' + total },
    payload: bytes,
    muteHttpExceptions: true
  });
  return driveProgress(res);
}

// Asks Drive how many bytes it has kept, so the browser can resume from there
function uploadStatus(body) {
  if (!UPLOAD_URL.test(String(body.url))) return { ok: false, error: 'bad-url' };
  var total = Number(body.total);
  if (!Number.isInteger(total) || total <= 0) return { ok: false, error: 'bad-range' };
  var res = UrlFetchApp.fetch(body.url, {
    method: 'put',
    headers: { 'Content-Range': 'bytes */' + total },
    muteHttpExceptions: true
  });
  return driveProgress(res);
}

// 200/201: file complete. 308: incomplete, the Range header says what Drive kept.
function driveProgress(res) {
  var code = res.getResponseCode();
  if (code === 200 || code === 201) return { ok: true, done: true };
  if (code !== 308) return { ok: false, error: 'drive-' + code };
  var range = res.getHeaders().Range || res.getHeaders().range || '';
  var m = /bytes=0-(\d+)/.exec(range);
  return { ok: true, done: false, next: m ? Number(m[1]) + 1 : 0 };
}

// Daily caps per account and per guest, so the public endpoint cannot fill the Drive
function reserveQuota(guestId, size) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var day = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    var bytesKey = 'bytes:' + day;
    var filesKey = 'files:' + day + ':' + guestId;
    var bytes = Number(props.getProperty(bytesKey) || 0);
    var files = Number(props.getProperty(filesKey) || 0);
    if (bytes + size > DAILY_BYTES || files + 1 > DAILY_FILES_PER_GUEST) return false;
    props.setProperty(bytesKey, String(bytes + size));
    props.setProperty(filesKey, String(files + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function freeBytes() {
  var limit = DriveApp.getStorageLimit();
  // Unlimited plans report a limit of 0 or less
  if (!(limit > 0)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, limit - DriveApp.getStorageUsed());
}

function findGuest(id) {
  if (!id) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('guests');
  if (!raw) {
    raw = UrlFetchApp.fetch(GUESTS_URL).getContentText();
    cache.put('guests', raw, 21600);
  }
  return JSON.parse(raw).filter(function (g) { return g.id === id; })[0] || null;
}

function rootFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: recreate below */ }
  }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

// One subfolder per guest; the lock avoids duplicates when several files start at once
function guestFolder(name) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var root = rootFolder();
    var found = root.getFoldersByName(name);
    return found.hasNext() ? found.next() : root.createFolder(name);
  } finally {
    lock.releaseLock();
  }
}

function safeName(name) {
  return String(name || 'foto').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
