# Waktu

A prayer-times, weather, and clock **kiosk** — a full-screen Electron display backed
by a small Fastify API that fetches and caches prayer times and weather.

## Monorepo layout

pnpm workspace with two apps:

```
apps/
  api/     Fastify service — prayer times + weather, cached in Redis   (waktu-api)
  client/  Electron + React + Vite + Tailwind kiosk display            (waktu-client)
```

## Requirements

- Node 22+
- pnpm (`corepack enable`)
- Docker (only to build/deploy the API image)

## Getting started

```sh
pnpm install
```

| Command | What it does |
| --- | --- |
| `pnpm dev:api` | Run the API locally (`node api`, port 3000) |
| `pnpm dev:client` | Run the Electron client (electron-vite dev) |
| `pnpm build:client` | Build the client (`--linux --arm64`) |
| `pnpm deploy:build` | Build + push the API image and render the deploy compose file |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Across all apps |

The API needs a Redis instance; in production it runs alongside one (see below).

## The API (`apps/api`)

Fastify server fronted by a Redis cache. Each endpoint caches the upstream response
until the top of the hour (weather) or end of month (prayer times), so upstreams
aren't hit on every request. All calls have an 8s timeout and log failures with the
upstream, status/code, and URL; a failed upstream returns `502`.

| Route | Returns | Upstream |
| --- | --- | --- |
| `GET /` | `{ "message": "OK!" }` health check | — |
| `GET /solat` | Prayer times (prev month tail → next month head) | aladhan |
| `GET /cuaca/semasa` | Current weather | open-meteo |
| `GET /cuaca/ramalan` | Hourly forecast (next 9 points) | open-meteo |
| `GET /gambar` | Random wallpaper | unsplash |

Location is resolved once via ip-api, falling back to a configurable default
(`DEFAULT_CITY`/`DEFAULT_COUNTRY`/`DEFAULT_LAT`/`DEFAULT_LON`).

**Environment:**

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `UNSPLASH_ACCESS_KEY` | _(unset)_ | Unsplash API key; `/gambar` returns `503` until set |
| `DEFAULT_CITY` / `DEFAULT_COUNTRY` / `DEFAULT_LAT` / `DEFAULT_LON` | Kuala Lumpur, MY | Fallback location when geolocation fails |

## The client (`apps/client`)

Electron + React kiosk. The API base URL is baked in at build time from
`VITE_API_BASE` (set it in `apps/client/.env`; see `.env.example`). It falls back to
the LAN default for local dev.

## Deploying

Build once, pull-and-run: `pnpm deploy:build` cross-builds the API image, pushes it
to your registry, and writes a self-contained `apps/api/docker-compose.deploy.yaml`
(API + Redis) with a concrete tag baked in — copy that one file to the target host and
`docker compose -f docker-compose.deploy.yaml up -d`. The host never builds.

Full walkthrough and overrides: [apps/api/DEPLOY.md](apps/api/DEPLOY.md).
