# Deploying the Waktu API

Build once, pull-and-run everywhere. You build and push the image from a build
machine; the target host only pulls and runs — no source, Node, or install on it.

## One-time setup

- A Docker **registry** the build machine can push to and the target host can pull
  from. The default is `localhost:5000` (override with `WAKTU_REGISTRY`). If it's
  plain-HTTP, add it to Docker's `insecure-registries` on both machines.
- `docker buildx` on the build machine (bundled with modern Docker Desktop) so the
  image can be cross-built for the target's CPU architecture.
- `pnpm` on the build machine (the image is built from the pnpm workspace; the
  target host needs neither pnpm nor Node).
- Copy `apps/api/.env.deploy.example` to `apps/api/.env.deploy` and adjust if the
  target isn't arm64, uses a different registry, or you want a host port other than 3000.

## Build, push, and generate the compose file

From the **monorepo root**:

```sh
pnpm deploy:build
```

This stamps a timestamped tag (e.g. `20260712-1430`), builds the `waktu-api` image
from the workspace (Docker context is the repo root; `apps/api/Dockerfile` runs
`pnpm deploy` to bundle a self-contained app), pushes
`WAKTU_REGISTRY/waktu-api:<tag>`, and writes a self-contained
`apps/api/docker-compose.deploy.yaml` with that tag baked in.

## Run on the target host

Copy the one generated file over and bring the stack up:

```sh
scp apps/api/docker-compose.deploy.yaml <host>:~/waktu/
ssh <host> "cd ~/waktu && docker compose -f docker-compose.deploy.yaml up -d"
```

The stack is two services: `redis` (cache, internal only) and `api` (published on
`WAKTU_PORT`, default 3000). To ship a change, re-run `pnpm deploy:build` and re-run
`docker compose ... up -d` on the host — the new tag makes compose recreate the API
while the Redis volume carries over.

## Overrides

| Variable          | Default          | Meaning                                       |
| ----------------- | ---------------- | --------------------------------------------- |
| `WAKTU_REGISTRY`  | `localhost:5000` | Registry to push to / pull from               |
| `WAKTU_PLATFORM`  | `linux/arm64`    | Target CPU arch (`linux/amd64` for x86 hosts) |
| `WAKTU_PORT`      | `3000`           | Host port mapped to the container             |
| `WAKTU_ENV_FILE`  | `.env.deploy`    | Path to the deploy env file (relative to apps/api) |
