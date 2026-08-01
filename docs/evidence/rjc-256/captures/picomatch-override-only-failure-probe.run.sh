#!/usr/bin/env bash
set -Eeuo pipefail

readonly COREPACK_ENTRYPOINT='/usr/local/lib/node_modules/corepack/dist/corepack.js'
readonly EXPECTED_COREPACK_SHA='3655bc798f300951f2070fee411b337d626b0c3ae80c2d24c46ccac4595d4bf9'
readonly PROBE='/home/node/probe'
readonly OUTPUT='/home/node/pnpm-output.log'

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
set +e
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
  --config.strict-peer-dependencies=true \
  >"$OUTPUT" 2>&1
readonly PNPM_EXIT=$?
set -e

cat "$OUTPUT"
echo "[probe] pnpm_exit_code=$PNPM_EXIT"
test "$PNPM_EXIT" = '1'
grep -F 'ERR_PNPM_PEER_DEP_ISSUES' "$OUTPUT"
grep -F 'fdir' "$OUTPUT"
grep -F 'picomatch' "$OUTPUT"
if test -f pnpm-lock.yaml; then
  echo "[probe] lock_sha256=$(sha256sum pnpm-lock.yaml | awk '{print $1}')"
else
  echo '[probe] no lockfile emitted'
fi
echo '[probe] PASS override-only input reproducibly remains strict-peer Red'
