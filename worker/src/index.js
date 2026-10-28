// Leaderboard API for the wedding games: /api/podio and /api/puntaje
import guests from '../../juegos/invitados.json';
import { Sala, SALA_GAMES } from './sala.js';
import { Buzon } from './buzon.js';

export { Sala, Buzon };

// Bounds reject scores no real round can produce
const GAMES = {
  'atrapa-el-ramo': { min: 1, max: 5000 },
  'camino-al-altar': { min: 1, max: 2000 },
  'memoria': { min: 8, max: 300, lowerIsBetter: true },
  'ronda-de-shots': { min: 1, max: 500 },
  'la-gran-huida': { min: 1, max: 3000 },
  'brindis': { min: 1, max: 300 },
  'hora-loca': { min: 1, max: 1600 }
};
const TOP = 10;
// Hub cards poll the room counts; caching keeps the rooms from waking on every poll
const COUNTS_TTL_SECONDS = 10;
const GUEST_NAMES = new Map(guests.map((g) => [g.id, g.name]));

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return origin && allowed.includes(origin) ? origin : null;
}

function json(body, status, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function topQuery(env, game) {
  const order = GAMES[game].lowerIsBetter ? 'ASC' : 'DESC';
  return env.DB
    .prepare(`SELECT guest, score FROM scores WHERE game = ? ORDER BY score ${order}, updated_at ASC LIMIT ${TOP}`)
    .bind(game);
}

function withNames(rows) {
  return rows
    .filter((r) => GUEST_NAMES.has(r.guest))
    .map((r) => ({ guest: r.guest, name: GUEST_NAMES.get(r.guest), score: r.score }));
}

async function podium(env) {
  const games = Object.keys(GAMES);
  const results = await env.DB.batch(games.map((game) => topQuery(env, game)));
  const out = {};
  games.forEach((game, i) => {
    out[game] = withNames(results[i].results);
  });
  return out;
}

async function submit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return { status: 400, body: { error: 'invalid_json' } };
  }
  const game = GAMES[body.game];
  const score = body.score;
  if (!game) return { status: 400, body: { error: 'unknown_game' } };
  if (!GUEST_NAMES.has(body.guest)) return { status: 400, body: { error: 'unknown_guest' } };
  if (!Number.isInteger(score) || score < game.min || score > game.max) {
    return { status: 400, body: { error: 'invalid_score' } };
  }

  // Keep only the guest's best score
  const better = game.lowerIsBetter ? '<' : '>';
  await env.DB
    .prepare(
      `INSERT INTO scores (game, guest, score, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (game, guest) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
       WHERE excluded.score ${better} scores.score`
    )
    .bind(body.game, body.guest, score, new Date().toISOString())
    .run();

  const [bestRow, top] = await env.DB.batch([
    env.DB.prepare('SELECT score FROM scores WHERE game = ? AND guest = ?').bind(body.game, body.guest),
    topQuery(env, body.game)
  ]);
  const best = bestRow.results[0].score;
  const ahead = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM scores WHERE game = ? AND score ${better} ?`)
    .bind(body.game, best)
    .first();

  return { status: 200, body: { best, rank: ahead.n + 1, top: withNames(top.results) } };
}

function roomName(url) {
  return (url.searchParams.get('sala') || 'boda').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'boda';
}

// How many guests are in each multiplayer room right now
async function roomCounts(env, ctx, room) {
  const cache = caches.default;
  const key = new Request('https://camiysebas.online/api/salas?sala=' + room);
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const entries = await Promise.all(SALA_GAMES.map(async (game) => {
    try {
      const res = await env.SALAS.get(env.SALAS.idFromName(game + ':' + room)).fetch('https://sala/estado');
      return [game, await res.json()];
    } catch (e) {
      return [game, { players: 0, playing: false }];
    }
  }));
  const counts = Object.fromEntries(entries);
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(counts), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + COUNTS_TTL_SECONDS }
  })));
  return counts;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: origin
          ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin'
          }
          : {}
      });
    }

    // Live invitations between guests: a single mailbox every open page connects to
    if (url.pathname === '/api/buzon') {
      if (!origin && env.ALLOW_NO_ORIGIN !== '1') return json({ error: 'forbidden' }, 403, null);
      return env.BUZON.get(env.BUZON.idFromName('boda')).fetch(request);
    }

    // Multiplayer rooms: one Durable Object per game and room name, reached over a WebSocket
    if (url.pathname === '/api/sala') {
      const game = url.searchParams.get('game');
      const room = roomName(url);
      // Browsers always send Origin on a WebSocket handshake; local tests may skip it
      if (!origin && env.ALLOW_NO_ORIGIN !== '1') return json({ error: 'forbidden' }, 403, null);
      if (!SALA_GAMES.includes(game)) return json({ error: 'unknown_game' }, 400, origin);
      return env.SALAS.get(env.SALAS.idFromName(game + ':' + room)).fetch(request);
    }

    try {
      if (url.pathname === '/api/salas' && request.method === 'GET') {
        return json(await roomCounts(env, ctx, roomName(url)), 200, origin);
      }
      if (url.pathname === '/api/podio' && request.method === 'GET') {
        return json(await podium(env), 200, origin);
      }
      if (url.pathname === '/api/puntaje' && request.method === 'POST') {
        // Browsers always send Origin on POST; this keeps other sites from posting scores
        if (!origin) return json({ error: 'forbidden' }, 403, null);
        const result = await submit(request, env);
        return json(result.body, result.status, origin);
      }
      return json({ error: 'not_found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server_error' }, 500, origin);
    }
  }
};
