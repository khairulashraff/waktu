# Waktu API image — Fastify service (api.js) fronted by a Redis cache.
#
# Built from the MONOREPO ROOT as context (so the pnpm workspace + lockfile are
# available) with `-f apps/api/Dockerfile`. scripts/deploy-build.mjs does this for
# you and pushes the result; the target host only pulls and runs it.
#
# The build stage installs just this app's prod deps, then `pnpm deploy` emits a
# self-contained bundle (flat, portable node_modules) under /out — the recommended
# way to containerize one app out of a pnpm workspace. The runtime stage copies
# only that bundle, so no pnpm, store, or workspace metadata ships in the image.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
# Workspace manifests first for a cacheable install layer. Both app manifests are
# needed so the frozen lockfile validates against the full workspace, but only
# waktu-api's deps are installed (--filter).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/client/package.json apps/client/package.json
RUN pnpm install --frozen-lockfile --filter waktu-api
# App source, then the self-contained production bundle. --legacy: this app has no
# injected workspace deps, so the classic deploy (required since pnpm v10 unless
# inject-workspace-packages is set) is what we want.
COPY apps/api apps/api
RUN pnpm --filter waktu-api deploy --prod --legacy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /out .
# Drop root.
USER node
EXPOSE 3000
CMD ["node", "api"]
