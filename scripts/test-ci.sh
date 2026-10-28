#!/usr/bin/env bash
# The tests the way CI runs them (.github/workflows/site.yml), on this machine: in
# Microsoft's Playwright container (Ubuntu, with the same browsers, system packages and
# fonts as the CI runner), with CI=true (retries, no test.only), both browsers, then a
# fresh build and the browser tests against it. Catches what only shows up on CI, like
# text that wraps differently in another font.
#
#   npm run test:ci                     everything
#   npm run test:ci -- layout map       only these spec files (both browsers, web and dist)
#
# Needs Docker or Podman (CONTAINER_ENGINE=podman to choose). The first run downloads the
# image (~2 GB). The container's node_modules and npm cache live in .ci/ (ignored by git),
# so the project's own node_modules is left alone; files it writes (dist/, test-results/)
# are owned by you.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
ENGINE=${CONTAINER_ENGINE:-$(command -v docker || command -v podman || true)}
[[ -n "$ENGINE" ]] || { echo "test-ci: needs Docker or Podman" >&2; exit 1; }

USER_OPTS=(--user "$(id -u):$(id -g)")
[[ "$(basename "$ENGINE")" == podman ]] && USER_OPTS+=(--userns=keep-id)

mkdir -p .ci/node_modules .ci/home
echo "test-ci: $IMAGE"
exec "$ENGINE" run --rm --init --ipc=host "${USER_OPTS[@]}" \
  -v "$PWD:/work" -w /work \
  -v "$PWD/.ci/node_modules:/work/node_modules" \
  -v "$PWD/.ci/home:/home/ci" \
  -e HOME=/home/ci -e CI=true \
  "$IMAGE" bash -c '
    set -euo pipefail
    echo "node $(node -v), npm $(npm -v)"
    npm ci --no-audit --no-fund --loglevel=error
    echo "== unit tests"; npm test
    echo "== browser tests (web/)"; npx playwright test "$@"
    echo "== build"; ./scripts/build.sh -c -q
    echo "== browser tests (dist/web)"; DARKBREEZY_E2E_ROOT=dist/web npx playwright test "$@"
  ' bash "$@"
