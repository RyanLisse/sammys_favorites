#!/usr/bin/env bash
set -euo pipefail

task_command="${1:-health}"
task_run_id="${2:-default}"
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_root"

sha256_text() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    sha256sum | awk '{print $1}'
  fi
}

slugify() {
  local task_value
  task_value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-')"
  task_value="${task_value#-}"
  task_value="${task_value%-}"
  printf '%s' "${task_value:-local}"
}

task_workspace_path="${CONDUCTOR_WORKSPACE_PATH:-$task_root}"
task_port_identity="${CONDUCTOR_PORT:-auto}"
task_discriminator="$(printf '%s' "${task_workspace_path}:${task_port_identity}" | sha256_text)"
task_discriminator="${task_discriminator:0:12}"
task_workspace="$(slugify "${CONDUCTOR_WORKSPACE_NAME:-$(basename "$task_workspace_path")}")"
task_workspace="${task_workspace:0:28}"
task_compose_project="sammys-${task_workspace}-${task_discriminator}"

if [[ -n "${CONDUCTOR_PORT:-}" ]]; then
  if [[ ! "$CONDUCTOR_PORT" =~ ^[0-9]+$ ]] || ((CONDUCTOR_PORT < 1024 || CONDUCTOR_PORT > 65531)); then
    printf 'CONDUCTOR_PORT must be an integer between 1024 and 65531\n' >&2
    exit 2
  fi
  task_base_port="$CONDUCTOR_PORT"
else
  task_hash_number=$((16#${task_discriminator:0:6}))
  task_base_port=$((20000 + (task_hash_number % 30000)))
fi

task_secret_dir="$task_root/.context/local-stack"
task_secret_file="$task_secret_dir/${task_discriminator}.env"
mkdir -p "$task_secret_dir"
chmod 700 "$task_secret_dir"

if [[ ! -f "$task_secret_file" ]]; then
  umask 077
  task_secret_tmp="${task_secret_file}.tmp.$$"
  {
    printf 'SAMMYS_POSTGRES_USER=sammys_%s\n' "$task_discriminator"
    printf 'SAMMYS_POSTGRES_DB=sammys_%s\n' "$task_discriminator"
    printf 'SAMMYS_POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'SAMMYS_REDIS_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'SAMMYS_MINIO_USER=sammys%s\n' "$task_discriminator"
    printf 'SAMMYS_MINIO_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'COOKIE_SECRET=%s\n' "$(openssl rand -hex 32)"
  } >"$task_secret_tmp"
  chmod 600 "$task_secret_tmp"
  mv "$task_secret_tmp" "$task_secret_file"
fi

set -a
# shellcheck disable=SC1090 -- generated local-only key/value file
source "$task_secret_file"
set +a

export SAMMYS_COMPOSE_PROJECT="$task_compose_project"
export SAMMYS_POSTGRES_PORT="$task_base_port"
export SAMMYS_REDIS_PORT="$((task_base_port + 1))"
export SAMMYS_MINIO_PORT="$((task_base_port + 2))"
export SAMMYS_MINIO_CONSOLE_PORT="$((task_base_port + 3))"

set_namespace() {
  local task_namespace_hash task_run_slug task_namespace_base
  task_run_slug="$(slugify "$1")"
  task_run_slug="${task_run_slug:0:20}"
  task_namespace_hash="$(printf '%s' "${task_discriminator}:$1" | sha256_text)"
  task_namespace_hash="${task_namespace_hash:0:8}"
  task_namespace_base="${task_workspace}-${task_run_slug}-${task_namespace_hash}"
  export SAMMYS_TEST_NAMESPACE="${task_namespace_base:0:60}"
  export SAMMYS_POSTGRES_SCHEMA="$(printf '%s' "$SAMMYS_TEST_NAMESPACE" | tr '-' '_')"
  export SAMMYS_REDIS_KEY_PREFIX="${SAMMYS_TEST_NAMESPACE}:"
  export SAMMYS_QUEUE_PREFIX="${SAMMYS_TEST_NAMESPACE}:queue:"
  export SAMMYS_OBJECT_BUCKET="${SAMMYS_TEST_NAMESPACE:0:63}"
}

set_namespace "$task_run_id"
task_compose=(docker compose -p "$task_compose_project" -f infra/local/compose.yaml)

postgres_exec() {
  "${task_compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 \
    -U "$SAMMYS_POSTGRES_USER" -d "$SAMMYS_POSTGRES_DB" "$@"
}

redis_exec() {
  "${task_compose[@]}" exec -T redis redis-cli --no-auth-warning -a "$SAMMYS_REDIS_PASSWORD" "$@"
}

minio_shell() {
  "${task_compose[@]}" run --rm -T --no-deps --entrypoint /bin/sh \
    -e SAMMYS_OBJECT_BUCKET="$SAMMYS_OBJECT_BUCKET" -e MINIO_COMMAND="$MINIO_COMMAND" minio-init -c \
    'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && eval "$MINIO_COMMAND"'
}

seed_namespace() {
  postgres_exec -c "CREATE SCHEMA IF NOT EXISTS \"$SAMMYS_POSTGRES_SCHEMA\";"
  postgres_exec -c "CREATE TABLE IF NOT EXISTS \"$SAMMYS_POSTGRES_SCHEMA\".sammys_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

  local task_migration task_version task_applied
  for task_migration in infra/local/migrations/*.sql; do
    task_version="$(basename "$task_migration")"
    task_applied="$(postgres_exec -Atc "SELECT 1 FROM \"$SAMMYS_POSTGRES_SCHEMA\".sammys_schema_migrations WHERE version = '$task_version';")"
    if [[ "$task_applied" != "1" ]]; then
      PGOPTIONS="--search_path=$SAMMYS_POSTGRES_SCHEMA" \
        "${task_compose[@]}" exec -T -e PGOPTIONS postgres psql -v ON_ERROR_STOP=1 \
        -v namespace="$SAMMYS_TEST_NAMESPACE" -U "$SAMMYS_POSTGRES_USER" -d "$SAMMYS_POSTGRES_DB" <"$task_migration"
      postgres_exec -c "INSERT INTO \"$SAMMYS_POSTGRES_SCHEMA\".sammys_schema_migrations (version) VALUES ('$task_version') ON CONFLICT DO NOTHING;"
    fi
  done

  local task_seed
  for task_seed in infra/local/seeds/*.sql; do
    PGOPTIONS="--search_path=$SAMMYS_POSTGRES_SCHEMA" \
      "${task_compose[@]}" exec -T -e PGOPTIONS postgres psql -v ON_ERROR_STOP=1 \
      -v namespace="$SAMMYS_TEST_NAMESPACE" -U "$SAMMYS_POSTGRES_USER" -d "$SAMMYS_POSTGRES_DB" <"$task_seed"
  done

  MINIO_COMMAND='mc mb --ignore-existing "local/$SAMMYS_OBJECT_BUCKET" >/dev/null'
  export MINIO_COMMAND
  minio_shell
}

wait_for_health() {
  local task_attempt
  for task_attempt in {1..30}; do
    if "${task_compose[@]}" ps --status running --services | grep -qx postgres && \
      "${task_compose[@]}" exec -T postgres pg_isready -U "$SAMMYS_POSTGRES_USER" -d "$SAMMYS_POSTGRES_DB" >/dev/null && \
      redis_exec ping 2>/dev/null | grep -q PONG && \
      "${task_compose[@]}" exec -T minio curl --fail --silent http://localhost:9000/minio/health/live >/dev/null; then
      return 0
    fi
    sleep 1
  done
  printf 'Local integration services did not become healthy\n' >&2
  return 1
}

create_backup() {
  local task_backup_dir
  task_backup_dir="$task_root/.context/backups/${task_compose_project}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$task_backup_dir/minio"
  chmod 700 "$task_backup_dir"
  postgres_exec --no-psqlrc -Atc 'SELECT 1' >/dev/null
  "${task_compose[@]}" exec -T postgres pg_dump --clean --if-exists --no-owner --no-privileges \
    -U "$SAMMYS_POSTGRES_USER" "$SAMMYS_POSTGRES_DB" >"$task_backup_dir/postgres.sql"
  redis_exec --rdb /data/sammys-backup.rdb >/dev/null
  "${task_compose[@]}" cp redis:/data/sammys-backup.rdb "$task_backup_dir/redis.rdb"
  "${task_compose[@]}" cp minio:/data/. "$task_backup_dir/minio"
  {
    printf 'compose_project=%s\n' "$task_compose_project"
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$task_backup_dir/manifest.txt"
  printf '%s\n' "$task_backup_dir"
}

restore_backup() {
  local task_backup_dir task_backup_absolute
  task_backup_dir="$1"
  test -f "$task_backup_dir/postgres.sql"
  test -f "$task_backup_dir/redis.rdb"
  test -d "$task_backup_dir/minio"
  task_backup_absolute="$(cd "$task_backup_dir" && pwd)"

  postgres_exec <"$task_backup_absolute/postgres.sql"

  "${task_compose[@]}" stop redis minio >/dev/null
  "${task_compose[@]}" run --rm -T --no-deps --entrypoint /bin/sh \
    -v "$task_backup_absolute:/backup:ro" redis -c \
    'rm -rf /data/appendonlydir /data/dump.rdb && cp /backup/redis.rdb /data/dump.rdb'
  "${task_compose[@]}" run --rm -T --no-deps --entrypoint /bin/sh \
    -v "$task_backup_absolute:/backup:ro" minio -c \
    'rm -rf /data/* /data/.[!.]* /data/..?* && cp -R /backup/minio/. /data/'
  "${task_compose[@]}" start redis minio >/dev/null
  wait_for_health
}

write_isolation_markers() {
  local task_value="$1"
  postgres_exec -c "INSERT INTO \"$SAMMYS_POSTGRES_SCHEMA\".sammys_health_fixture (fixture_key, fixture_value) VALUES ('isolation', '$task_value') ON CONFLICT (fixture_key) DO UPDATE SET fixture_value = EXCLUDED.fixture_value;" >/dev/null
  redis_exec set "${SAMMYS_REDIS_KEY_PREFIX}isolation" "$task_value" >/dev/null
  MINIO_COMMAND="printf '%s' '$task_value' | mc pipe 'local/$SAMMYS_OBJECT_BUCKET/isolation.txt' >/dev/null"
  export MINIO_COMMAND
  minio_shell
}

read_minio_marker() {
  MINIO_COMMAND='mc cat "local/$SAMMYS_OBJECT_BUCKET/isolation.txt"'
  export MINIO_COMMAND
  minio_shell
}

case "$task_command" in
  up)
    "${task_compose[@]}" up --detach --wait postgres redis minio
    ;;
  down)
    # Deliberately preserves named volumes. Use destroy only as an explicit opt-in.
    "${task_compose[@]}" down --remove-orphans
    ;;
  destroy)
    "${task_compose[@]}" down --volumes --remove-orphans
    ;;
  health)
    wait_for_health
    ;;
  seed)
    seed_namespace
    ;;
  env)
    printf 'SAMMYS_COMPOSE_PROJECT=%s\n' "$SAMMYS_COMPOSE_PROJECT"
    printf 'SAMMYS_TEST_NAMESPACE=%s\n' "$SAMMYS_TEST_NAMESPACE"
    printf 'SAMMYS_POSTGRES_SCHEMA=%s\n' "$SAMMYS_POSTGRES_SCHEMA"
    printf 'SAMMYS_REDIS_KEY_PREFIX=%s\n' "$SAMMYS_REDIS_KEY_PREFIX"
    printf 'SAMMYS_QUEUE_PREFIX=%s\n' "$SAMMYS_QUEUE_PREFIX"
    printf 'DATABASE_URL=postgres://%s:%s@127.0.0.1:%s/%s?options=-csearch_path%%3D%s\n' "$SAMMYS_POSTGRES_USER" "$SAMMYS_POSTGRES_PASSWORD" "$SAMMYS_POSTGRES_PORT" "$SAMMYS_POSTGRES_DB" "$SAMMYS_POSTGRES_SCHEMA"
    printf 'REDIS_URL=redis://:%s@127.0.0.1:%s/0\n' "$SAMMYS_REDIS_PASSWORD" "$SAMMYS_REDIS_PORT"
    printf 'S3_ENDPOINT=http://127.0.0.1:%s\n' "$SAMMYS_MINIO_PORT"
    printf 'S3_ACCESS_KEY=%s\n' "$SAMMYS_MINIO_USER"
    printf 'S3_SECRET_KEY=%s\n' "$SAMMYS_MINIO_PASSWORD"
    printf 'S3_BUCKET=%s\n' "$SAMMYS_OBJECT_BUCKET"
    printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
    printf 'COOKIE_SECRET=%s\n' "$COOKIE_SECRET"
    ;;
  smoke)
    task_second_run_id="${3:-isolation-b}"
    # Run each seed in its own shell so environment/search_path state cannot
    # bleed between namespace setup hooks.
    "$0" seed "$task_run_id"
    task_a_namespace="$SAMMYS_TEST_NAMESPACE"
    task_a_schema="$SAMMYS_POSTGRES_SCHEMA"
    task_a_redis_prefix="$SAMMYS_REDIS_KEY_PREFIX"
    task_a_bucket="$SAMMYS_OBJECT_BUCKET"
    set_namespace "$task_second_run_id"
    "$0" seed "$task_second_run_id"
    task_b_namespace="$SAMMYS_TEST_NAMESPACE"
    task_b_schema="$SAMMYS_POSTGRES_SCHEMA"
    task_b_redis_prefix="$SAMMYS_REDIS_KEY_PREFIX"
    task_b_bucket="$SAMMYS_OBJECT_BUCKET"
    [[ "$task_a_namespace" != "$task_b_namespace" ]]

    set_namespace "$task_run_id"
    write_isolation_markers "value-$task_a_namespace"
    set_namespace "$task_second_run_id"
    write_isolation_markers "value-$task_b_namespace"

    [[ "$(postgres_exec -Atc "SELECT fixture_value FROM \"$task_a_schema\".sammys_health_fixture WHERE fixture_key = 'isolation';")" == "value-$task_a_namespace" ]]
    [[ "$(postgres_exec -Atc "SELECT fixture_value FROM \"$task_b_schema\".sammys_health_fixture WHERE fixture_key = 'isolation';")" == "value-$task_b_namespace" ]]
    [[ "$(redis_exec get "${task_a_redis_prefix}isolation")" == "value-$task_a_namespace" ]]
    [[ "$(redis_exec get "${task_b_redis_prefix}isolation")" == "value-$task_b_namespace" ]]
    set_namespace "$task_run_id"
    [[ "$(read_minio_marker)" == "value-$task_a_namespace" ]]
    set_namespace "$task_second_run_id"
    [[ "$(read_minio_marker)" == "value-$task_b_namespace" ]]
    printf 'Isolation smoke passed for %s and %s (schemas %s/%s, Redis prefixes %s/%s, buckets %s/%s)\n' \
      "$task_a_namespace" "$task_b_namespace" "$task_a_schema" "$task_b_schema" "$task_a_redis_prefix" "$task_b_redis_prefix" "$task_a_bucket" "$task_b_bucket"
    ;;
  backup)
    create_backup
    ;;
  restore)
    restore_backup "${2:?restore requires a backup directory}"
    ;;
  backup-roundtrip)
    seed_namespace
    task_roundtrip_before="before-${SAMMYS_TEST_NAMESPACE}"
    write_isolation_markers "$task_roundtrip_before"
    task_roundtrip_backup="$(create_backup)"
    write_isolation_markers "after-${SAMMYS_TEST_NAMESPACE}"
    restore_backup "$task_roundtrip_backup"
    [[ "$(postgres_exec -Atc "SELECT fixture_value FROM \"$SAMMYS_POSTGRES_SCHEMA\".sammys_health_fixture WHERE fixture_key = 'isolation';")" == "$task_roundtrip_before" ]]
    [[ "$(redis_exec get "${SAMMYS_REDIS_KEY_PREFIX}isolation")" == "$task_roundtrip_before" ]]
    [[ "$(read_minio_marker)" == "$task_roundtrip_before" ]]
    printf 'Backup/restore round trip passed: %s\n' "$task_roundtrip_backup"
    ;;
  *)
    printf 'Unknown command: %s\n' "$task_command" >&2
    exit 2
    ;;
esac
