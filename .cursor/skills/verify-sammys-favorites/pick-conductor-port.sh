#!/usr/bin/env bash
set -euo pipefail

task_start_port="${1:-58010}"
task_step="${2:-10}"
task_max_attempts="${3:-200}"

port_in_use() {
  local task_port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$task_port" 2>/dev/null | grep -q ":$task_port"
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$task_port" -sTCP:LISTEN -t >/dev/null 2>&1
    return
  fi
  (echo >/dev/tcp/127.0.0.1/"$task_port") >/dev/null 2>&1
}

port_block_free() {
  local task_base_port="$1" task_offset
  for task_offset in 0 1 2 3 4 5 6 7; do
    if port_in_use "$((task_base_port + task_offset))"; then
      return 1
    fi
  done
  return 0
}

task_candidate="$task_start_port"
for ((task_attempt = 0; task_attempt < task_max_attempts; task_attempt++)); do
  if port_block_free "$task_candidate"; then
    printf '%s\n' "$task_candidate"
    exit 0
  fi
  task_candidate=$((task_candidate + task_step))
done

printf 'No free CONDUCTOR_PORT block found starting at %s\n' "$task_start_port" >&2
exit 1
