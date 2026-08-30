#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$task_root"

task_base_port="${CONDUCTOR_PORT:?set CONDUCTOR_PORT}"
export CONDUCTOR_PORT="$task_base_port"

scripts/local-stack.sh health

while IFS='=' read -r task_key task_url; do
  case "$task_key" in
    *_URL)
      curl --fail --silent --show-error --output /dev/null "$task_url"
      printf 'ok %s\n' "$task_url"
      ;;
  esac
done < <(.cursor/skills/verify-sammys-favorites/shell-urls.sh)

printf 'Doctor passed for CONDUCTOR_PORT=%s\n' "$task_base_port"
