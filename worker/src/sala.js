// One Durable Object per multiplayer room: it keeps the round in memory and
// talks to every guest in the room over a WebSocket.
import guests from '../../juegos/invitados.json';
import { PREGUNTAS } from './preguntas.js';

const GUEST_NAMES = new Map(guests.map((g) => [g.id, g.name]));
const TICK_MS = 125;
const COUNTDOWN_MS = 3500;
const RESULTS_MS = 12000;
const IDLE_MS = 15 * 60 * 1000; // an untouched room hangs up so it stops costing
const MAX_TAPS_PER_SECOND = 16; // faster than fingers; anything above is a script

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Game rules. Each one is a small state machine driven by the room:
//   join(room, p)            a player entered the room
//   begin(room, now)         the countdown ended
//   message(room, p, m, now) a player sent something
//   tick(room, now)          every TICK_MS while playing
//   leave(room, p, now)      a player left mid-round (optional)
//   view(room, now)          public round state
//   player(room, p)          public per-player state
// `live` rules broadcast on every tick; the others only when something changes.
// ---------------------------------------------------------------------------

// Team Cami vs Team Sebas: every tap pulls the rope.
// Every few seconds a short "double strength" window opens for both teams.
const tira = {
  min: 2,
  live: true,
  join(room, p) {
    const sizes = teamSizes(room);
    p.team = sizes.cami <= sizes.sebas ? 'cami' : 'sebas';
    p.taps = 0;
  },
  begin(room, now) {
    room.g = {
      pos: 0, pending: { cami: 0, sebas: 0 }, rate: { cami: 0, sebas: 0 }, winner: null,
      boostAt: now + rand(5000, 8000), boostUntil: 0
    };
    room.players.forEach((p) => {
      p.taps = 0;
    });
    room.setPhase('playing', 30000);
  },
  message(room, p, m, now) {
    if (m.t === 'team' && room.phase === 'lobby' && (m.team === 'cami' || m.team === 'sebas')) {
      p.team = m.team;
      return true;
    }
    if (m.t === 'tap' && room.phase === 'playing') {
      const n = room.takeTaps(p, m.n);
      p.taps += n;
      room.g.pending[p.team] += n * (now < room.g.boostUntil ? 2 : 1);
    }
    return false;
  },
  tick(room, now) {
    const g = room.g;
    const sizes = teamSizes(room);
    if (now >= g.boostAt) {
      g.boostUntil = now + 2500;
      g.boostAt = now + rand(7000, 10000);
    }
    // Average taps per member, so a bigger team has no built-in advantage
    const each = { cami: g.pending.cami / Math.max(1, sizes.cami), sebas: g.pending.sebas / Math.max(1, sizes.sebas) };
    g.pos = clamp(g.pos + (each.sebas - each.cami) * 0.02, -1, 1);
    // Smoothed effort per team, for the strength meters
    g.rate.cami = g.rate.cami * 0.75 + each.cami * 0.25;
    g.rate.sebas = g.rate.sebas * 0.75 + each.sebas * 0.25;
    g.pending = { cami: 0, sebas: 0 };
    if (Math.abs(g.pos) >= 1 || now >= room.phaseEnds) {
      g.winner = g.pos > 0.02 ? 'sebas' : g.pos < -0.02 ? 'cami' : 'empate';
      const mvps = [...room.players.values()]
        .filter((p) => g.winner === 'empate' || p.team === g.winner)
        .sort((a, b) => b.taps - a.taps);
      room.finish({
        headline: g.winner === 'empate' ? '¡Empate!' : 'Ganó el Equipo ' + (g.winner === 'cami' ? 'Cami' : 'Sebas'),
        ranking: mvps.map((p) => ({ id: p.id, name: p.name, value: p.taps, unit: 'jalones' }))
      });
    }
  },
  view(room, now) {
    const g = room.g;
    return {
      pos: g.pos || 0, teams: teamSizes(room), winner: g.winner || null,
      boost: !!g.boostUntil && now < g.boostUntil,
      rate: g.rate ? { cami: +g.rate.cami.toFixed(2), sebas: +g.rate.sebas.toFixed(2) } : { cami: 0, sebas: 0 }
    };
  },
  player(room, p) {
    return { team: p.team, taps: p.taps };
  }
};

function teamSizes(room) {
  const sizes = { cami: 0, sebas: 0 };
  room.players.forEach((p) => {
    if (p.team) sizes[p.team]++;
  });
  return sizes;
}

// Tap race down the aisle, with two things in the way that have to be jumped
const carrera = {
  min: 1,
  live: true,
  join(room, p) {
    p.progress = 0;
    p.place = 0;
    p.cleared = 0;
    p.jumpAt = 0;
    p.stunUntil = 0;
    p.look = p.look || 'sebas';
  },
  begin(room) {
    room.g = { goal: 100, finished: 0, hurdles: [Math.round(rand(28, 38)), Math.round(rand(60, 72))] };
    room.players.forEach((p) => {
      p.progress = 0;
      p.place = 0;
      p.cleared = 0;
      p.jumpAt = 0;
      p.stunUntil = 0;
    });
    room.setPhase('playing', 45000);
  },
  message(room, p, m, now) {
    if (m.t === 'look' && (m.who === 'cami' || m.who === 'sebas')) {
      p.look = m.who;
      return true;
    }
    if (room.phase !== 'playing' || p.place) return false;
    if (m.t === 'jump') {
      // A jump covers the next second; it can't be spammed
      if (now - p.jumpAt > 1300) p.jumpAt = now;
      return false;
    }
    if (m.t !== 'tap' || now < p.stunUntil) return false;
    const g = room.g;
    p.progress = Math.min(g.goal, p.progress + room.takeTaps(p, m.n));
    while (p.cleared < g.hurdles.length && p.progress >= g.hurdles[p.cleared]) {
      if (now - p.jumpAt <= 1000) {
        p.cleared++;
      } else {
        // Ran straight into it: back a step and a moment on the floor
        p.progress = g.hurdles[p.cleared] - 1;
        p.stunUntil = now + 1500;
        break;
      }
    }
    if (p.progress >= g.goal) p.place = ++g.finished;
    return false;
  },
  tick(room, now) {
    const podium = Math.min(3, room.players.size);
    if (room.g.finished >= podium || now >= room.phaseEnds) {
      const order = [...room.players.values()].sort((a, b) =>
        (a.place || 999) - (b.place || 999) || b.progress - a.progress);
      room.finish({
        headline: order[0].name + ' llegó primero al altar',
        ranking: order.map((p) => ({ id: p.id, name: p.name, value: p.place ? p.place + '.º' : p.progress + '%', unit: '' }))
      });
    }
  },
  view(room) {
    return { goal: room.g.goal || 100, hurdles: room.g.hurdles || [] };
  },
  player(room, p) {
    const now = Date.now();
    return { p: p.progress, place: p.place, look: p.look, stun: now < p.stunUntil, air: now - p.jumpAt < 600 };
  }
};

// Everyone votes Cami or Sebas; voting with the majority scores, and streaks score double
const voto = {
  min: 1,
  live: false,
  join(room, p) {
    p.score = 0;
    p.vote = null;
    p.hit = false;
    p.streak = 0;
  },
  begin(room, now) {
    room.g = { list: shuffle(PREGUNTAS).slice(0, 8), idx: 0, stage: 'vote', stageEnds: now + 10000, counts: null, majority: null, voters: null };
    room.players.forEach((p) => {
      p.score = 0;
      p.vote = null;
      p.hit = false;
      p.streak = 0;
    });
    room.setPhase('playing', 0);
  },
  message(room, p, m) {
    if (m.t !== 'vote' || room.phase !== 'playing' || room.g.stage !== 'vote') return false;
    if (m.v !== 'cami' && m.v !== 'sebas') return false;
    p.vote = m.v;
    return true;
  },
  tick(room, now) {
    const g = room.g;
    const players = [...room.players.values()];
    if (g.stage === 'vote') {
      const everyone = players.length > 0 && players.every((p) => p.vote);
      if (now < g.stageEnds && !everyone) return;
      g.counts = { cami: 0, sebas: 0 };
      g.voters = { cami: [], sebas: [] };
      players.forEach((p) => {
        if (!p.vote) return;
        g.counts[p.vote]++;
        if (g.voters[p.vote].length < 14) g.voters[p.vote].push(p.name.split(' ')[0]);
      });
      g.majority = g.counts.cami === g.counts.sebas ? 'empate' : g.counts.cami > g.counts.sebas ? 'cami' : 'sebas';
      players.forEach((p) => {
        p.hit = !!p.vote && (g.majority === 'empate' || p.vote === g.majority);
        p.streak = p.hit ? p.streak + 1 : 0;
        // From the third hit in a row, each one is worth double
        if (p.hit) p.score += p.streak >= 3 ? 2 : 1;
      });
      g.stage = 'reveal';
      g.stageEnds = now + 5500;
      room.dirty = true;
    } else if (now >= g.stageEnds) {
      g.idx++;
      if (g.idx >= g.list.length) {
        const order = players.sort((a, b) => b.score - a.score);
        room.finish({
          headline: order[0].name + ' piensa como la mayoría',
          ranking: order.map((p) => ({ id: p.id, name: p.name, value: p.score, unit: 'pts' }))
        });
        return;
      }
      players.forEach((p) => {
        p.vote = null;
        p.hit = false;
      });
      g.stage = 'vote';
      g.stageEnds = now + 10000;
      g.counts = null;
      g.majority = null;
      g.voters = null;
      room.dirty = true;
    }
  },
  view(room, now) {
    const g = room.g;
    if (!g.list) return {};
    const total = g.counts ? g.counts.cami + g.counts.sebas : 0;
    return {
      q: g.list[g.idx], idx: g.idx, total: g.list.length, stage: g.stage, left: Math.max(0, g.stageEnds - now),
      counts: g.counts, majority: g.majority, voters: g.voters,
      unanimous: total >= 3 && Math.max(g.counts.cami, g.counts.sebas) / total >= 0.85,
      voted: [...room.players.values()].filter((p) => p.vote).length
    };
  },
  player(room, p) {
    const reveal = room.g.stage === 'reveal';
    return { score: p.score, streak: p.streak, voted: !!p.vote, vote: reveal ? p.vote : undefined, hit: reveal ? p.hit : undefined };
  }
};

// Wait for "¡Salud!", then tap first. Look-alike words flash by to bait you:
// tapping on one of those, or any time before the real one, sits the round out.
const SENUELOS = ['¡Salsa!', '¡Saludos!', '¡Salida!', '¡Salto!', '¡Salami!', '¡Salón!', '¡Saludable!'];

function armRound(g, now) {
  g.stage = 'wait';
  g.goAt = now + rand(3200, 6500);
  g.decoy = null;
  g.decoyUntil = 0;
  // Up to two baits, never too close to the real signal
  g.baits = [];
  const count = Math.floor(rand(0, 2.99));
  for (let i = 0; i < count; i++) g.baits.push(rand(now + 1100, g.goAt - 1100));
  g.baits.sort((a, b) => a - b);
  g.results = [];
}

const reflejos = {
  min: 1,
  live: false,
  join(room, p) {
    p.score = 0;
    p.ms = null;
    p.early = false;
  },
  begin(room, now) {
    room.g = { round: 0, total: 5, stageEnds: 0 };
    armRound(room.g, now);
    room.players.forEach((p) => {
      p.score = 0;
      p.ms = null;
      p.early = false;
    });
    room.setPhase('playing', 0);
  },
  message(room, p, m, now) {
    if (m.t !== 'react' || room.phase !== 'playing') return false;
    const g = room.g;
    if (g.stage === 'wait' && !p.early) {
      p.early = true;
      return true;
    }
    if (g.stage === 'go' && p.ms === null && !p.early) {
      p.ms = Math.max(1, Math.round(now - g.goAt));
      return true;
    }
    return false;
  },
  tick(room, now) {
    const g = room.g;
    const players = [...room.players.values()];
    if (g.stage === 'wait') {
      if (g.decoy && now >= g.decoyUntil) {
        g.decoy = null;
        room.dirty = true;
      }
      if (g.baits.length && now >= g.baits[0]) {
        g.baits.shift();
        g.decoy = SENUELOS[Math.floor(Math.random() * SENUELOS.length)];
        g.decoyUntil = now + 750;
        room.dirty = true;
      }
      if (now < g.goAt) return;
      g.stage = 'go';
      g.decoy = null;
      g.goAt = now; // measured from the moment the signal really went out
      g.stageEnds = now + 3000;
      room.dirty = true;
    } else if (g.stage === 'go') {
      const done = players.every((p) => p.early || p.ms !== null);
      if (now < g.stageEnds && !done) return;
      const order = players.filter((p) => p.ms !== null).sort((a, b) => a.ms - b.ms);
      [5, 3, 2, 1].forEach((points, i) => {
        if (order[i]) order[i].score += points;
      });
      g.results = order.slice(0, 5).map((p) => ({ id: p.id, name: p.name, ms: p.ms }));
      g.fooled = players.filter((p) => p.early).length;
      g.stage = 'show';
      g.stageEnds = now + 4500;
      room.dirty = true;
    } else if (now >= g.stageEnds) {
      g.round++;
      if (g.round >= g.total) {
        const order = players.sort((a, b) => b.score - a.score);
        room.finish({
          headline: order[0].name + ' tiene los mejores reflejos',
          ranking: order.map((p) => ({ id: p.id, name: p.name, value: p.score, unit: 'pts' }))
        });
        return;
      }
      players.forEach((p) => {
        p.ms = null;
        p.early = false;
      });
      armRound(g, now);
      room.dirty = true;
    }
  },
  view(room) {
    const g = room.g;
    if (!g.stage) return {};
    const show = g.stage === 'show';
    return { round: g.round, total: g.total, stage: g.stage, decoy: g.decoy || null, results: show ? g.results : [], fooled: show ? g.fooled : 0 };
  },
  player(room, p) {
    return { score: p.score, ms: p.ms, early: p.early };
  }
};

// Hot potato with the wedding bill: whoever holds it when time runs out is out.
// The holder chooses who gets it next.
const cuenta = {
  min: 2,
  live: false,
  join(room, p) {
    p.alive = false;
    p.got = 0;
    p.outRound = 0;
  },
  begin(room, now) {
    room.g = { round: 1, stage: 'pass', holders: [], out: [], startAt: now, boomAt: 0, heat: 0, stageEnds: 0 };
    room.players.forEach((p) => {
      p.alive = true;
      p.outRound = 0;
    });
    room.setPhase('playing', 0);
    dealBills(room, now);
  },
  message(room, p, m, now) {
    const g = room.g;
    if (m.t !== 'pass' || room.phase !== 'playing' || g.stage !== 'pass') return false;
    // A short hold keeps the bill from bouncing faster than anyone can see
    if (!g.holders.includes(p.id) || now - p.got < 350) return false;
    return passBill(room, p, now, m.to);
  },
  leave(room, p, now) {
    if (room.phase === 'playing' && room.g.holders && room.g.holders.includes(p.id)) {
      if (!passBill(room, p, now)) room.g.holders = room.g.holders.filter((id) => id !== p.id);
    }
  },
  tick(room, now) {
    const g = room.g;
    if (g.stage === 'pass') {
      // Nobody knows the exact moment, only that it is getting hotter
      const heat = Math.min(3, Math.floor(4 * (now - g.startAt) / (g.boomAt - g.startAt)));
      if (heat !== g.heat) {
        g.heat = heat;
        room.dirty = true;
      }
      if (now < g.boomAt) return;
      g.out = g.holders.slice();
      room.players.forEach((p) => {
        if (g.out.includes(p.id)) {
          p.alive = false;
          p.outRound = g.round;
        }
      });
      g.holders = [];
      g.stage = 'boom';
      g.stageEnds = now + 3500;
      room.dirty = true;
    } else if (now >= g.stageEnds) {
      const alive = [...room.players.values()].filter((p) => p.alive);
      if (alive.length <= 1 || g.round >= 10) {
        // Survivors first, then whoever lasted longest
        const order = [...room.players.values()].sort((a, b) =>
          (b.alive ? 99 : b.outRound) - (a.alive ? 99 : a.outRound));
        room.finish({
          headline: alive.length === 1 ? alive[0].name + ' se salvó de pagar' : 'Se salvaron ' + alive.length,
          ranking: order.map((p) => ({ id: p.id, name: p.name, value: p.alive ? 'a salvo' : 'pagó en la ' + p.outRound, unit: '' }))
        });
        return;
      }
      g.round++;
      g.stage = 'pass';
      g.out = [];
      dealBills(room, now);
      room.dirty = true;
    }
  },
  view(room) {
    const g = room.g;
    if (!g.stage) return {};
    return { round: g.round, stage: g.stage, holders: g.holders, out: g.out, heat: g.heat || 0,
      alive: [...room.players.values()].filter((p) => p.alive).length };
  },
  player(room, p) {
    return { alive: p.alive };
  }
};

// More bills in play as the room grows, so a big party doesn't take forever
function dealBills(room, now) {
  const alive = shuffle([...room.players.values()].filter((p) => p.alive));
  const bills = Math.max(1, Math.min(alive.length - 1, Math.ceil(alive.length / 6)));
  room.g.holders = alive.slice(0, bills).map((p) => {
    p.got = now;
    return p.id;
  });
  room.g.startAt = now;
  room.g.heat = 0;
  room.g.boomAt = now + rand(8000, 14000);
}

// `wanted` is who the holder picked; anyone alive without a bill will do otherwise
function passBill(room, from, now, wanted) {
  const g = room.g;
  const free = [...room.players.values()].filter((p) => p.alive && !g.holders.includes(p.id));
  if (!free.length) return false;
  const to = free.find((p) => p.id === wanted) || free[Math.floor(Math.random() * free.length)];
  to.got = now;
  g.holders = g.holders.map((id) => (id === from.id ? to.id : id));
  g.last = { from: from.id, to: to.id };
  return true;
}

const RULES = {
  'tira-y-afloja': tira,
  'carrera-al-altar': carrera,
  'cami-o-sebas': voto,
  'reflejos': reflejos,
  'pasa-la-cuenta': cuenta
};

export const SALA_GAMES = Object.keys(RULES);

// ---------------------------------------------------------------------------

export class Sala {
  constructor() {
    this.players = new Map(); // guest id -> player
    this.rules = null;
    this.game = '';
    this.phase = 'lobby';
    this.phaseEnds = 0;
    this.g = {};
    this.results = null;
    this.timer = null;
    this.dirty = false;
    this.lastActivity = Date.now();
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Player count for the hub cards (asked by the Worker, never by a browser)
    if (url.pathname === '/estado') {
      return Response.json({ players: this.players.size, playing: this.phase === 'countdown' || this.phase === 'playing' });
    }
    const game = url.searchParams.get('game');
    const guest = url.searchParams.get('guest');
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!RULES[game] || !GUEST_NAMES.has(guest)) return new Response('Unknown game or guest', { status: 400 });

    this.game = game;
    this.rules = RULES[game];
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    this.join(server, guest);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  join(ws, id) {
    const now = Date.now();
    this.lastActivity = now;
    // The same guest on a second device takes over the seat
    const old = this.players.get(id);
    if (old) {
      try {
        old.ws.close(4000, 'Opened somewhere else');
      } catch (e) { /* already gone */ }
    }
    const p = old || { id, name: GUEST_NAMES.get(id), tokens: MAX_TAPS_PER_SECOND, refilled: now };
    p.ws = ws;
    if (!old) {
      this.players.set(id, p);
      this.rules.join(this, p);
    }

    ws.addEventListener('message', (event) => {
      let m;
      try {
        m = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (this.players.get(id) !== p || p.ws !== ws || !m || typeof m.t !== 'string') return;
      this.onMessage(p, m);
    });
    const gone = () => {
      if (this.players.get(id) === p && p.ws === ws) this.leave(p);
    };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);

    this.broadcast();
    this.ensureTimer();
  }

  leave(p) {
    this.players.delete(p.id);
    if (this.rules.leave) this.rules.leave(this, p, Date.now());
    if (!this.players.size) {
      this.toLobby();
      this.stopTimer();
      return;
    }
    this.broadcast();
  }

  onMessage(p, m) {
    const now = Date.now();
    this.lastActivity = now;
    if (m.t === 'start') {
      if (this.phase === 'lobby' && this.players.size >= this.rules.min) {
        this.results = null;
        this.setPhase('countdown', COUNTDOWN_MS);
        this.broadcast();
      }
      return;
    }
    if (this.rules.message(this, p, m, now)) this.dirty = true;
    // Lobby changes (like switching team) show up right away
    if (this.dirty && this.phase === 'lobby') this.broadcast();
  }

  // Token bucket: how many of the claimed taps this player may really have made
  takeTaps(p, claimed) {
    const now = Date.now();
    p.tokens = Math.min(MAX_TAPS_PER_SECOND, p.tokens + (now - p.refilled) / 1000 * MAX_TAPS_PER_SECOND);
    p.refilled = now;
    const n = Math.max(0, Math.min(Math.floor(p.tokens), Math.floor(Number(claimed) || 0)));
    p.tokens -= n;
    return n;
  }

  setPhase(phase, ms) {
    this.phase = phase;
    this.phaseEnds = ms ? Date.now() + ms : 0;
    this.dirty = true;
  }

  finish(results) {
    this.results = results;
    this.setPhase('results', RESULTS_MS);
  }

  toLobby() {
    this.phase = 'lobby';
    this.phaseEnds = 0;
    this.g = {};
    this.dirty = true;
  }

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const now = Date.now();
    if (this.phase === 'lobby') {
      if (now - this.lastActivity > IDLE_MS) {
        this.players.forEach((p) => {
          try {
            p.ws.close(4001, 'Idle room');
          } catch (e) { /* already gone */ }
        });
        this.players.clear();
        this.stopTimer();
      }
      return;
    }
    if (this.phase === 'countdown') {
      if (now >= this.phaseEnds) this.rules.begin(this, now);
    } else if (this.phase === 'playing') {
      this.rules.tick(this, now);
    } else if (this.phase === 'results' && now >= this.phaseEnds) {
      this.toLobby();
    }
    if (this.dirty || (this.rules.live && this.phase === 'playing')) this.broadcast();
  }

  snapshot(now) {
    return {
      t: 'state',
      game: this.game,
      phase: this.phase,
      left: this.phaseEnds ? Math.max(0, this.phaseEnds - now) : 0,
      min: this.rules.min,
      players: [...this.players.values()].map((p) => Object.assign({ id: p.id, name: p.name }, this.rules.player(this, p))),
      g: this.rules.view(this, now),
      results: this.phase === 'results' ? this.results : null
    };
  }

  broadcast() {
    this.dirty = false;
    const text = JSON.stringify(this.snapshot(Date.now()));
    this.players.forEach((p) => {
      try {
        p.ws.send(text);
      } catch (e) { /* the close handler removes it */ }
    });
  }
}
