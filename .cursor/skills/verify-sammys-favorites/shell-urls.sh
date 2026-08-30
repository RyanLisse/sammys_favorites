#!/usr/bin/env bash
set -euo pipefail

task_base_port="${CONDUCTOR_PORT:?set CONDUCTOR_PORT}"

printf 'COMMERCE_PORT=%s\n' "$((task_base_port + 4))"
printf 'STOREFRONT_PORT=%s\n' "$((task_base_port + 5))"
printf 'ATELIER_PORT=%s\n' "$((task_base_port + 6))"
printf 'AGENT_WORKER_PORT=%s\n' "$((task_base_port + 7))"
printf 'COMMERCE_HEALTH_URL=http://127.0.0.1:%s/health\n' "$((task_base_port + 4))"
printf 'STOREFRONT_URL=http://127.0.0.1:%s/\n' "$((task_base_port + 5))"
printf 'ATELIER_HEALTH_URL=http://127.0.0.1:%s/health\n' "$((task_base_port + 6))"
printf 'AGENT_WORKER_HEALTH_URL=http://127.0.0.1:%s/health\n' "$((task_base_port + 7))"
