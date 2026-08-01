#!/usr/bin/env bash
set -euo pipefail

task_base_port="${CONDUCTOR_PORT:-46000}"
export COMMERCE_PORT="$((task_base_port + 4))"
export STOREFRONT_PORT="$((task_base_port + 5))"
export ATELIER_PORT="$((task_base_port + 6))"
export AGENT_WORKER_PORT="$((task_base_port + 7))"

# local-stack.sh generates credentials under ignored .context storage. Import
# only its known keys; never commit or duplicate those values in app templates.
while IFS='=' read -r task_key task_value; do
  case "$task_key" in
    DATABASE_URL | REDIS_URL | S3_ENDPOINT | S3_ACCESS_KEY | S3_SECRET_KEY | S3_BUCKET | SAMMYS_COMPOSE_PROJECT | SAMMYS_TEST_NAMESPACE | SAMMYS_POSTGRES_SCHEMA | SAMMYS_REDIS_KEY_PREFIX | SAMMYS_QUEUE_PREFIX | JWT_SECRET | COOKIE_SECRET)
      export "$task_key=$task_value"
      ;;
  esac
done < <(scripts/local-stack.sh env dev)

export STORE_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
export ADMIN_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
export AUTH_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
export MEDUSA_DISABLE_TELEMETRY=true

pnpm --filter @sammys/commerce exec medusa db:migrate

exec pnpm dev
