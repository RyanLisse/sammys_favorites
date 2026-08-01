# Local integration services

`scripts/local-stack.sh` runs PostgreSQL, Redis, and MinIO in a Compose project isolated by workspace name plus a stable SHA-256 discriminator of `CONDUCTOR_WORKSPACE_PATH` and `CONDUCTOR_PORT`. Conductor supplies four consecutive ports starting at `CONDUCTOR_PORT`; outside Conductor a stable path-derived range is used.

The first invocation generates unique PostgreSQL, Redis, MinIO, JWT, and cookie secrets in `.context/local-stack/<discriminator>.env` with mode `0600`. `.context` is gitignored by Conductor. Compose has no credential defaults and will fail closed if the generated environment is absent. Never copy these secrets into tracked environment templates.

Every run ID maps to all four explicit isolation dimensions:

- `SAMMYS_POSTGRES_SCHEMA`, also applied as PostgreSQL `search_path` in `DATABASE_URL`;
- `SAMMYS_REDIS_KEY_PREFIX`;
- `SAMMYS_QUEUE_PREFIX`;
- `SAMMYS_OBJECT_BUCKET`.

`seed` creates the schema, applies each idempotent file in `migrations/` once using `sammys_schema_migrations`, reruns idempotent hooks in `seeds/`, and creates the bucket. `smoke` performs real writes and reads across two distinct schemas, prefixes, and buckets. `backup-roundtrip` proves PostgreSQL, Redis, and MinIO can all be restored to a pre-mutation marker. Backups and generated state remain under ignored `.context` storage.

Commands:

- `scripts/local-stack.sh up`
- `scripts/local-stack.sh health`
- `scripts/local-stack.sh env <run-id>`
- `scripts/local-stack.sh seed <run-id>`
- `scripts/local-stack.sh smoke <run-a> <run-b>`
- `scripts/local-stack.sh backup <run-id>`
- `scripts/local-stack.sh restore <backup-directory>`
- `scripts/local-stack.sh backup-roundtrip <run-id>`
- `scripts/local-stack.sh down` (containers/network only; preserves volumes)
- `scripts/local-stack.sh destroy` (explicitly removes this workspace project's volumes)

All Compose references use `tag@sha256:index-digest`. `image-digests.json` records the registry source and the resolved Linux AMD64/ARM64 platform digests observed on 2026-08-01.
