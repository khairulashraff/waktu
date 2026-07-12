# Electron client BUILDER image.
#
# Built from the MONOREPO ROOT as context (so the pnpm workspace + lockfile are in
# scope) with `-f apps/client/Dockerfile` — deploy.sh / deploy.bat do this for you.
# The container's CMD (`build:linux`) runs electron-builder and writes the unpacked
# app to /repo/apps/client/release, which the deploy scripts mount out to the host.

FROM node:22-bookworm-slim
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends p7zip-full ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
# Workspace manifests first for a cacheable install layer. Both app manifests are
# needed so the frozen lockfile validates against the full workspace; only
# waktu-client's deps are installed (--filter). Its postinstall (electron-builder
# install-app-deps) runs here, and pnpm-workspace.yaml carries the build approvals.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/client/package.json apps/client/package.json
RUN pnpm install --frozen-lockfile --filter waktu-client

# Client source (node_modules / build outputs excluded by .dockerignore).
COPY apps/client apps/client
WORKDIR /repo/apps/client

# Build at container-run time; output lands under ./release (mounted out by deploy).
CMD ["pnpm", "run", "build:linux"]
