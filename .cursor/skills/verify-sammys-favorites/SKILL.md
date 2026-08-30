---
name: verify-sammys-favorites
description: Launch, doctor, drive, and capture visual proof for Sammy's Favorites local app shells using repo scripts. Seed/fixture data only; never commit proof artifacts.
---

# Verify Sammy's Favorites

End-to-end local verification for the four application shells. Use this skill before merging UI-visible work and whenever a change touches startup, ports, local services, or the dev stack.

Work in **poteto-mode**: one job, prove it on the real artifact, report remaining risk plainly. Do not copy Catapulze's Bun/Effect stack. Effect is not a repository default ([ADR 0002](../../../docs/decisions/0002-effect-adoption-boundary.md)).

## When to use

- A PR changes anything users see in a browser or anything that affects local startup.
- You need to prove the four shells still launch against real Postgres, Redis, and MinIO.
- You need inspected visual proof of the real user path before merge.

Do **not** use live family PII, production commerce credentials, or production Telegram/Stripe/AliExpress endpoints. Seed and fixture data only.

## Prerequisites

- Node.js >= 24, pnpm 11, Docker with Compose v2.
- Dependencies installed: `pnpm install --frozen-lockfile`.
- Repo root as working directory.

## Port map

All four shells derive from one isolated `CONDUCTOR_PORT`. Never hijack a developer's existing session; pick a free block first.

| Shell | Workspace | Port | Health / entry |
| --- | --- | --- | --- |
| Commerce | `@sammys/commerce` | `CONDUCTOR_PORT + 4` | `/health` |
| Storefront | `@sammys/storefront` | `CONDUCTOR_PORT + 5` | `/` |
| Atelier | `@sammys/atelier` | `CONDUCTOR_PORT + 6` | `/health` |
| Agent worker | `@sammys/agent-worker` | `CONDUCTOR_PORT + 7` | `/health` |

Infrastructure ports on the same block (from `scripts/local-stack.sh`):

- Postgres: `CONDUCTOR_PORT`
- Redis: `CONDUCTOR_PORT + 1`
- MinIO API: `CONDUCTOR_PORT + 2`
- MinIO console: `CONDUCTOR_PORT + 3`

Helper: `.cursor/skills/verify-sammys-favorites/shell-urls.sh` prints resolved ports and URLs when `CONDUCTOR_PORT` is set.

## Repo scripts (prefer these)

| Script | Purpose |
| --- | --- |
| `scripts/local-stack.sh` | `up`, `health`, `seed`, `env`, `smoke`, `down` — Postgres/Redis/MinIO via `infra/local/compose.yaml`; isolated compose project + namespace; secrets under ignored `.context/local-stack/` |
| `scripts/run-local-dev.sh` | Imports `local-stack.sh env dev`, migrates Medusa, runs `pnpm dev` |
| `scripts/verify-shell-startup.sh` | Waits for all four shells from fresh processes (default `CONDUCTOR_PORT=58010`) |
| `pnpm check` | `ultracite check` + typecheck + test |
| `pnpm format` | `ultracite fix` |

Never use `qlty fmt`. Lefthook runs Ultracite on staged JS/TS.

## Workflow

### 1. Launch

Pick an isolated port block so you do not collide with another Conductor workspace or local dev session:

```sh
export CONDUCTOR_PORT="$(
  .cursor/skills/verify-sammys-favorites/pick-conductor-port.sh 58010
)"
export CONDUCTOR_WORKSPACE_PATH="$PWD"
export CONDUCTOR_WORKSPACE_NAME="${CONDUCTOR_WORKSPACE_NAME:-verify-local}"

scripts/local-stack.sh up
scripts/local-stack.sh seed verify
```

Optional: `eval "$(.cursor/skills/verify-sammys-favorites/shell-urls.sh | sed -n 's/^\([A-Z_]*\)=\(.*\)/export \1="\2"/p')"` to export shell ports and URLs.

To run all four shells locally after seed:

```sh
scripts/run-local-dev.sh
```

Or prove cold startup in one shot (CI path):

```sh
scripts/verify-shell-startup.sh
```

### 2. Doctor

Confirm integration services and shell endpoints:

```sh
.cursor/skills/verify-sammys-favorites/doctor-shells.sh
```

This runs `scripts/local-stack.sh health` and curls the four shell URLs. For full cold-start proof, also run `scripts/verify-shell-startup.sh` with the same `CONDUCTOR_PORT`.

### 3. Drive (fixture path)

Inspect the surface before capturing proof. For the current clean-room foundation:

1. Open the storefront at `http://127.0.0.1:$((CONDUCTOR_PORT + 5))/`.
2. Confirm the home page renders ("Storefront shell is ready").
3. Optionally confirm seed isolation: `scripts/local-stack.sh env verify` shows the namespace; Postgres fixture table `sammys_health_fixture` is populated by `infra/local/seeds/001_health_fixture.sql` after seed.

Use seed/fixture data only. Do not drive against production APIs or real customer data.

### 4. Capture visual proof

After inspecting the surface, capture a screenshot or short screen recording of the real user path on the **isolated storefront port**.

- Write artifacts only under `.context/verify-artifacts/` (gitignored).
- Never commit screenshots, videos, or proof files.
- Keep artifacts local or CI-ephemeral; attach to the PR description or review thread, not the repo.

Example screenshot path:

```sh
mkdir -p .context/verify-artifacts
# browser or screencapture tool → .context/verify-artifacts/storefront-verify.png
```

### 5. Report remaining risk

State plainly what was verified, what was not run, and what could still fail in CI or production. Examples:

- Docker unavailable in the agent environment → infra doctor not executed here.
- Visual proof captured locally but not attached to the PR.
- Change touches only docs/scripts → storefront drive skipped with reason.

### 6. Teardown

```sh
scripts/local-stack.sh down
```

Use `scripts/local-stack.sh destroy` only when you explicitly want volumes removed.

## Merge bar (see also `AGENTS.md`)

Merge nothing until **all** GitHub CI jobs on the PR are green:

- Frozen lockfile and advisory verification (`pnpm audit --audit-level high`)
- Policy PostgreSQL durability
- Real local services / `verify-shell-startup`
- Quality gates (`pnpm check`, types, tests, build)
- Every Workspace matrix job
- `claude-review` if present on the PR

UI-visible PRs require inspected visual proof of the real user path. One finding per patch → `pnpm check` → wait for CI → push.

## Helper scripts in this folder

| Script | Role |
| --- | --- |
| `pick-conductor-port.sh [start] [step] [max]` | Find a free eight-port block |
| `shell-urls.sh` | Emit shell ports and URLs for `CONDUCTOR_PORT` |
| `doctor-shells.sh` | `local-stack health` + curl the four shell endpoints |
