#!/usr/bin/env bash
set -euo pipefail

task_base_port="${CONDUCTOR_PORT:-58010}"
task_timeout_seconds="${SAMMYS_STARTUP_TIMEOUT_SECONDS:-120}"
task_log_root="$(mktemp -d "${TMPDIR:-/tmp}/sammys-shell-startup.XXXXXX")"
task_log_file="$task_log_root/dev.log"
task_dev_pid=""

cleanup() {
  if [[ -n "$task_dev_pid" ]]; then
    kill -- "-$task_dev_pid" 2>/dev/null || true
    wait "$task_dev_pid" 2>/dev/null || true
  fi
  rm -rf "$task_log_root"
}
trap cleanup EXIT INT TERM

export CONDUCTOR_PORT="$task_base_port"
export TURBO_FORCE=true

perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' -- \
  scripts/run-local-dev.sh >"$task_log_file" 2>&1 &
task_dev_pid="$!"

task_end_epoch="$((SECONDS + task_timeout_seconds))"
task_urls=(
  "http://127.0.0.1:$((task_base_port + 4))/health"
  "http://127.0.0.1:$((task_base_port + 5))/"
  "http://127.0.0.1:$((task_base_port + 6))/health"
  "http://127.0.0.1:$((task_base_port + 7))/health"
)

for task_url in "${task_urls[@]}"; do
  until curl --fail --silent --show-error --output /dev/null "$task_url"; do
    if ! kill -0 "$task_dev_pid" 2>/dev/null || (( SECONDS >= task_end_epoch )); then
      printf 'Shell startup failed while waiting for %s\n' "$task_url" >&2
      sed -n '1,240p' "$task_log_file" >&2
      exit 1
    fi
    sleep 1
  done
done

printf 'All four application shells responded successfully.\n'
