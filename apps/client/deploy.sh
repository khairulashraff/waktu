#!/bin/bash
# Build the Electron client via Docker, ship the unpacked app to a remote host over
# SSH, then restart it via supervisor.
#
# Host-specific settings (target host, user, paths) live in a git-ignored
# .env.deploy — copy .env.deploy.example to .env.deploy and fill it in.

set -e
cd "$(dirname "$0")"

# --- Load host-specific config (git-ignored) ---
if [ -f .env.deploy ]; then
  set -a
  . ./.env.deploy
  set +a
fi

REMOTE_USER="${REMOTE_USER:-root}"
SUPERVISOR_SERVICE_NAME="${SUPERVISOR_SERVICE_NAME:-waktu-client}"
: "${REMOTE_HOST:?Set REMOTE_HOST in apps/client/.env.deploy (copy .env.deploy.example)}"
: "${REMOTE_APP_DIR:?Set REMOTE_APP_DIR in apps/client/.env.deploy}"

# VITE_API_BASE is baked into the client at build time. The build runs inside the
# container, so it must be passed through to `docker run` (below) — the .env file
# is not visible in the image.
if [ -z "${VITE_API_BASE:-}" ]; then
  echo "Warning: VITE_API_BASE is not set in .env.deploy — the client will build with"
  echo "         the default http://localhost:3000 and will not reach a remote API."
fi

# --- Build Step ---
# Context is the monorepo root (../..) so the pnpm workspace + lockfile are in
# scope; the Dockerfile lives here in apps/client.
echo "Building the Electron application using Docker..."
docker build -t waktu-client-builder -f Dockerfile ../..
docker run --rm -e VITE_API_BASE="${VITE_API_BASE:-}" -v "$(pwd)/release:/repo/apps/client/release" waktu-client-builder

# --- Deployment Step ---
echo "Deploying to ${REMOTE_HOST}..."

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Using version ${VERSION} from package.json"

# The build output for an unpacked Linux app from electron-builder is in
# 'release/<version>/linux-arm64-unpacked'.
BUILD_DIR="release/${VERSION}/linux-arm64-unpacked"

if [ ! -d "$BUILD_DIR" ]; then
    echo "Error: Build directory '$BUILD_DIR' not found."
    echo "Please check your electron-builder configuration and build output."
    exit 1
fi

cd "$BUILD_DIR"

# Create the remote directory, then pipe the tar archive to unpack it on the remote host.
echo "Transferring application files..."
tar -cf - . | ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_APP_DIR} && tar -C ${REMOTE_APP_DIR} -xvf -"

# --- Restart Step ---
echo "Restarting the application via supervisorctl..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "sudo supervisorctl restart ${SUPERVISOR_SERVICE_NAME}"

echo "Deployment finished successfully!"
