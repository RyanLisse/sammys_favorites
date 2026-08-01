# ADR 0002: Bound Effect adoption to evidence-backed adapters

- Status: Accepted
- Date: 2026-08-01
- Issue: RJC-298
- Architecture map: [Sammy's Favorites architecture](../architecture.md)

## Context

Sammy's Favorites uses Medusa for durable commerce workflows, Zod schemas and plain TypeScript DTOs for public contracts, and Promise-returning ports between runtimes. The current applications contain no measured reliability or maintainability failure that requires another application framework.

Effect offers typed failures, interruption, retry schedules, scoped resource management, Layers, and OpenTelemetry integration. Those capabilities can be useful inside a process that owns several heterogeneous asynchronous resources. They do not justify overlapping Medusa's durable workflow state, compensation, retry, container, or telemetry responsibilities.

## Decision

Effect is not a repository-wide platform default.

1. Medusa remains the sole owner of durable commerce workflows, compensation, commerce-domain events, Medusa step retries, and incoming route validation.
2. RJC-258 remains the owner of shared Zod/OpenAPI contracts, DTOs, and ports. Public interfaces use plain TypeScript values and `Promise` results. Effect runtime types and errors do not cross those interfaces.
3. RJC-265 remains the owner of durable integration delivery, idempotent delivery, dead letters, and reconciliation. Effect is not another durable workflow or delivery engine.
4. An isolated worker or outbound adapter may use Effect internally only after satisfying the pilot trigger below. The direct dependency belongs only to that runtime workspace.
5. One system owns each resource lifecycle. Effect must not manage a Medusa-owned database, workflow engine, event bus, or container registration.
6. Each external action has one retry owner and one documented total attempt and time budget. Medusa and an adapter must never silently nest retries.
7. `@sammys/observability` owns telemetry policy, redaction, naming, sampling, and exporter selection. An Effect adapter may create child spans through the approved pipeline but may not initialize a competing telemetry SDK.
8. Adding Effect to `@sammys/storefront` requires a separate ADR with a concrete browser use case and measured bundle, memory, and startup evidence.

## Pilot trigger

RJC-299 may start a comparison only when one concrete workflow:

1. owns at least three independent asynchronous dependencies;
2. has materially different requirements across at least three of timeout, retry classification/backoff, cancellation, runtime decoding, and cleanup;
3. has a named runtime owner outside Medusa's durable commerce boundary; and
4. can be compared with plain TypeScript using identical DTOs, fixtures, retry/time budgets, telemetry, and failure scenarios.

## Fastest-disproof criteria

Stop or reject the pilot as soon as any of these is true:

- fewer than three independent asynchronous dependencies exist;
- plain TypeScript with `Promise`, `AbortSignal`, existing Zod schemas, and explicit `try/finally` passes the same matrix with equal or less complexity;
- Effect types leak into a shared package or require changing an RJC-258 public contract merely to accommodate Effect;
- Effect and Medusa would both retry, compensate, persist, or own the same action or resource;
- the pilot requires a second dependency container or telemetry exporter;
- cancellation cannot prove cleanup and prevention of post-cancel writes;
- existing reason codes, receipts, idempotency keys, or trace parentage are lost;
- cold start, memory, dependency footprint, or test complexity gets worse without a demonstrated reliability gain.

The comparison must cover success, decode failure, retryable and terminal failure, timeout, cancellation during every dependency, cleanup failure, and retry exhaustion.

## Non-goals

- replacing Medusa workflows, compensation, validation, or container;
- replacing Zod/OpenAPI contracts with Effect Schema;
- adding Effect to every workspace or the storefront;
- adopting `@effect/workflow` as a second durable workflow engine;
- implementing RJC-258 contracts or RJC-265 delivery;
- selecting an Effect version before a qualifying pilot exists.

## Consequences

The repository keeps one durable commerce workflow owner and stable framework-neutral public contracts. A future adapter can still demonstrate Effect's value, but adoption requires comparable evidence and remains locally reversible.

## Official references

- [Effect Layers](https://effect.website/docs/requirements-management/layers/)
- [Effect retrying](https://effect.website/docs/error-management/retrying/)
- [Effect tracing](https://effect.website/docs/observability/tracing/)
- [Medusa workflows](https://docs.medusajs.com/learn/fundamentals/workflows)
- [Medusa workflow retries](https://docs.medusajs.com/learn/fundamentals/workflows/retry-failed-steps)
- [Medusa compensation](https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function)
- [Medusa route validation](https://docs.medusajs.com/learn/fundamentals/api-routes/validation)
