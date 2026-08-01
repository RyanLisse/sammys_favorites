# ADR 0001: Clean-room foundation and historical upstream research

- Status: Accepted; supersedes the proposed direct-use path
- Date: 2026-08-01
- Historical research subject: `306-Technologies/306-starter-monorepo`
- Historical research revision: `10b5d4b0623123737854a3cb02d54f6e32a1fb9e`

## Decision

Sammy's Favorites uses a **clean-room foundation**. The production repository is scaffolded independently from official pnpm, Turborepo, Next.js, and Medusa documentation and published packages. It must not reuse 306 source code, dependency manifests or lockfiles, configuration, generated files, or build output.

The pinned 306 revision remains recorded only so the earlier technical research has honest provenance. It is not a baseline, dependency, template, or approved source. No owner risk-acceptance comment is required because direct use is no longer an option selected by this ADR.

The upstream root was marked `UNLICENSED`; inspection found no root `LICENSE*` or `COPYING*` file and GitHub reported no detected repository license. Nothing in this ADR claims upstream permission, a license grant, or legal clearance.

Ryan Lisse is the accountable decision and rollback coordinator for this clean-room foundation. That accountability covers maintaining this decision, coordinating provenance review, and ordering removal and independent recreation when provenance is uncertain. It does not constitute legal approval, upstream permission, or specialist legal clearance.

## Drivers

- The product needs an independently maintainable foundation with clear provenance.
- An `UNLICENSED` public repository must not be treated as reusable source.
- Version choices must be justified by official sources and verified against the actual Sammy manifests, rather than inherited from a historical lockfile.
- Research evidence must remain auditable without becoming an implementation input.

## Consequences

- Only `@sammys/*` workspace identities are permitted.
- Production manifests and source must not refer to the 306 repository, pin, or `@starter/*` packages.
- Historical captures and superseded conformance lineages under `docs/evidence/rjc-256/` are non-normative research records. They may describe the rejected direct-use investigation but may not be consumed by builds, installs, generators, or runtime code.
- RJC-257 may consume only the clean-room version matrix and target map. It must create or retain Sammy-owned code sourced from official documentation and package APIs.
- Any future proposal to reuse upstream material requires a new ADR and written permission or applicable license terms. It cannot silently reverse this decision.

## Supersession and rollback

This decision supersedes all earlier direct-use proposals and owner-confirmation gates. If provenance cannot be demonstrated for a file, remove and independently recreate it from official sources; do not attempt to justify it using the old research record.
