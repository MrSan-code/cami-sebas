// Invitations between guests: every open page of the site keeps one WebSocket here,
// so a guest can invite another one to a multiplayer room and the other sees it live.
import guests from '../../juegos/invitados.json';
import { SALA_GAMES } from './sala.js';

const GUEST_NAMES = new Map(guests.map((g) => [g.id, g.name]));
// Anti-spam: the same person can't be invited by the same guest more often than this
const SAME_TARGET_COOLDOWN_MS = 30 * 1000;
const MAX_INVITES_PER_MINUTE = 10;

export class Buzon {
  constructor() {
    this.sockets = new Map(); // guest id -> Set of sockets (one per open tab)
    this.sent = new Map(); // guest id -> { at: [timestamps], last: Map(target -> timestamp) }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const guest = url.searchParams.get('guest');
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!GUEST_NAMES.has(guest)) return new Response('Unknown guest', { status: 400 });

    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept();
    this.add(guest, ws);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  add(id, ws) {
    if (!this.sockets.has(id)) this.sockets.set(id, new Set());
    this.sockets.get(id).add(ws);

    ws.addEventListener('message', (event) => {
      let m;
      try {
        m = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'online') this.send(ws, { t: 'online', ids: [...this.sockets.keys()] });
      if (m.t === 'invite') this.invite(id, ws, m);
    });
    const gone = () => {
      const set = this.sockets.get(id);
      if (!set) return;
      set.delete(ws);
      if (!set.size) this.sockets.delete(id);
    };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  invite(from, ws, m) {
    const to = String(m.to || '');
    const game = String(m.game || '');
    const sala = String(m.sala || 'boda').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'boda';
    if (!GUEST_NAMES.has(to) || to === from || !SALA_GAMES.includes(game)) {
      this.send(ws, { t: 'sent', to, ok: false, reason: 'invalid' });
      return;
    }
    if (!this.allowed(from, to)) {
      this.send(ws, { t: 'sent', to, ok: false, reason: 'wait' });
      return;
    }
    const targets = this.sockets.get(to);
    if (!targets || !targets.size) {
      this.send(ws, { t: 'sent', to, ok: false, reason: 'offline' });
      return;
    }
    const invite = { t: 'invite', from: { id: from, name: GUEST_NAMES.get(from) }, game, sala };
    targets.forEach((target) => this.send(target, invite));
    this.send(ws, { t: 'sent', to, ok: true });
  }

  allowed(from, to) {
    const now = Date.now();
    const log = this.sent.get(from) || { at: [], last: new Map() };
    log.at = log.at.filter((t) => now - t < 60 * 1000);
    if (log.at.length >= MAX_INVITES_PER_MINUTE) return false;
    if (now - (log.last.get(to) || 0) < SAME_TARGET_COOLDOWN_MS) return false;
    log.at.push(now);
    log.last.set(to, now);
    this.sent.set(from, log);
    return true;
  }

  send(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) { /* socket already closed */ }
  }
}
