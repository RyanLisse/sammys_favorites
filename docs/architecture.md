# Sammy's Favorites architecture ownership

This map points to the decisions and boundaries that are authoritative during the clean-room build. It does not replace the ADRs or security model.

## Decision records

- [ADR 0001: upstream baseline and clean-room decision](decisions/0001-upstream-baseline-and-direct-use-risk.md)
- [ADR 0002: bounded Effect adoption](decisions/0002-effect-adoption-boundary.md)
- [Threat model and approval policy](security/threat-model.md)

## Ownership map

| Concern | Owner | Boundary |
| --- | --- | --- |
| Durable commerce mutations, compensation and commerce retry | Medusa workflows in `@sammys/commerce` | Callers submit typed workflow commands; no generic Medusa client crosses the port. |
| Shared schemas, DTOs and ports | RJC-258 and the contract workspaces | Public cross-runtime interfaces use plain TypeScript values and `Promise` results. |
| Supplier reads, quotes and order writes | Separate SupplierGateway capabilities | Order writes require policy evaluation and authenticated, action-bound approval. |
| Durable external delivery, dead letters and reconciliation | RJC-265 | Adapters do not create a second delivery engine. |
| Authorization, replay protection and kill switches | `@sammys/policy` | Agents cannot execute effects; trusted services enforce deterministic decisions. |
| Telemetry, audit and redaction policy | `@sammys/observability` | One approved trace/export pipeline; providers and runtimes preserve trace context. |

Effect is not a repository default. ADR 0002 defines the objective trigger and fastest-disproof criteria for any future adapter-local pilot.
