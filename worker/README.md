# Podio de los juegos (Cloudflare Worker)

API for the shared leaderboard of `/juegos/`. It runs on `camiysebas.online/api/*`
and stores each guest's best score per game in a D1 database.

| Endpoint | What it does |
| --- | --- |
| `GET /api/podio` | Top 10 of every game |
| `POST /api/puntaje` | Saves `{ game, guest, score }` if it beats the guest's best; returns `{ best, rank, top }` |

The guest list is `../juegos/invitados.json`. The site reads it for the "¿Quién eres?"
picker and the Worker bundles it to validate scores, so it is the only place to edit.

## Multiplayer rooms

`WebSocket /api/sala?game=<id>&sala=<room>&guest=<id>` connects a guest to a live room. Each
room is a Durable Object (`src/sala.js`) that keeps the round in memory; nothing is stored.
Games: `tira-y-afloja`, `carrera-al-altar`, `cami-o-sebas`, `reflejos`, `pasa-la-cuenta`.
The questions for "¿Cami o Sebas?" are in `src/preguntas.js`.

Durable Objects need the account to have a workers.dev subdomain. If `wrangler deploy` fails
with `You need a workers.dev subdomain` (code 10063), open **Workers & Pages** once in the
Cloudflare dashboard (that creates it), then deploy again.

## Deploy (once)

Run from this `worker/` folder.

```sh
npx wrangler login
npx wrangler d1 create camiysebas-juegos
```

Copy the `database_id` it prints into `wrangler.toml`, then:

```sh
npx wrangler d1 execute camiysebas-juegos --remote --file=schema.sql
npx wrangler deploy
```

Check it: <https://camiysebas.online/api/podio> should return four empty lists.
Then publish the site to GitHub Pages as usual.

## Later changes

- Guest list changed: edit `juegos/invitados.json`, run `npx wrangler deploy`, and publish the site.
- Scores are tied to the guest `id` (the name in lowercase with dashes). Renaming a guest hides their old scores.

## Deleting scores

```sh
# everything
npx wrangler d1 execute camiysebas-juegos --remote --command "DELETE FROM scores"
# one game: atrapa-el-ramo, camino-al-altar, memoria, ronda-de-shots, la-gran-huida, brindis or hora-loca
npx wrangler d1 execute camiysebas-juegos --remote --command "DELETE FROM scores WHERE game = 'memoria'"
# one guest (id from juegos/invitados.json)
npx wrangler d1 execute camiysebas-juegos --remote --command "DELETE FROM scores WHERE guest = 'laura'"
# see what is stored
npx wrangler d1 execute camiysebas-juegos --remote --command "SELECT * FROM scores ORDER BY game, score DESC"
```

## Local testing

```sh
npx wrangler d1 execute camiysebas-juegos --local --file=schema.sql
npx wrangler dev --port 8787
```

Serve the site on port 8765 and, in the browser console, point the games at the local API:

```js
localStorage.setItem('cys-juegos:api', 'http://127.0.0.1:8787/api')
```

Remove that key to go back to `/api`.
