#!/usr/bin/env bash
set -Eeuo pipefail

readonly COREPACK_ENTRYPOINT='/usr/local/lib/node_modules/corepack/dist/corepack.js'
readonly EXPECTED_COREPACK_SHA='3655bc798f300951f2070fee411b337d626b0c3ae80c2d24c46ccac4595d4bf9'
readonly PROBE='/home/node/probe'

mkdir -p "$PROBE/apps/api"
cp /home/node/probe-root-package.json "$PROBE/package.json"
cp /home/node/probe-api-package.json "$PROBE/apps/api/package.json"
cp /home/node/probe-workspace.yaml "$PROBE/pnpm-workspace.yaml"
cd "$PROBE"

echo '[probe] environment readback'
date -u +'%Y-%m-%dT%H:%M:%SZ'
test "$(id -u)" = '1000'
test "$(uname -m)" = 'aarch64'
test "$(node --version)" = 'v24.18.1'
test ! -e /var/run/docker.sock
test "$(awk '/^CapEff:/{print $2}' /proc/self/status)" = '0000000000000000'
test "$(awk '/^NoNewPrivs:/{print $2}' /proc/self/status)" = '1'
test "$(sha256sum "$COREPACK_ENTRYPOINT" | awk '{print $1}')" = "$EXPECTED_COREPACK_SHA"

node "$COREPACK_ENTRYPOINT" prepare pnpm@11.18.0 --activate
test "$(node "$COREPACK_ENTRYPOINT" pnpm --version)" = '11.18.0'

echo '[probe] logical command'
echo 'pnpm install --lockfile-only --ignore-scripts --network-concurrency=1 --fetch-retries=3 --fetch-retry-factor=2 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000 --config.engine-strict=true --config.strict-peer-dependencies=true'
/usr/bin/timeout --signal=TERM --kill-after=30s 600s \
  node --max-old-space-size=1024 "$COREPACK_ENTRYPOINT" pnpm install \
  --lockfile-only \
  --ignore-scripts \
  --network-concurrency=1 \
  --fetch-retries=3 \
  --fetch-retry-factor=2 \
  --fetch-retry-mintimeout=10000 \
  --fetch-retry-maxtimeout=60000 \
  --config.engine-strict=true \
  --config.strict-peer-dependencies=true

test -f pnpm-lock.yaml
grep -F 'fdir@6.1.1(picomatch@3.0.2)' pnpm-lock.yaml
grep -F 'picomatch@3.0.2' pnpm-lock.yaml
grep -F 'picomatch@4.0.5' pnpm-lock.yaml
echo "[probe] lock_sha256=$(sha256sum pnpm-lock.yaml | awk '{print $1}')"
echo '[probe] PASS direct API provider binds fdir to picomatch 3.0.2 while picomatch 4.0.5 coexists'
