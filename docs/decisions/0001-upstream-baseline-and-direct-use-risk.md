# ADR 0001: Upstream baseline and direct-use risk

- Status: Selected for RJC-256; owner-authored Linear confirmation remains pending
- Date: 2026-07-31
- Upstream: `https://github.com/306-Technologies/306-starter-monorepo`
- Revision: `10b5d4b0623123737854a3cb02d54f6e32a1fb9e`

## Decision

For RJC-256, select product-owner direct-use risk acceptance for the exact upstream revision above. This decision authorizes repository-native evidence and a bounded, isolated compatibility spike only. Production scaffolding and feature-source reuse are outside RJC-256 and must not begin before RJC-257.

The upstream root is `UNLICENSED`. Inspection at the pin found no root `LICENSE*` or `COPYING*` file, and GitHub reported no detected repository license on 2026-07-31. Ryan's acceptance is **not upstream permission**, is **not an upstream license**, and is **not legal clearance**. The unresolved reuse risk remains visible even if the technical spike succeeds.

Ryan Lisse is the business-risk owner. Ryan Lisse is also the engineering-maintenance owner for the selected version baseline and advisory follow-up. The basis currently recorded is his Linear assignment and his instruction that he takes “all responsibility.” Closure remains gated on a comment authored from Ryan's own Linear identity that confirms both roles and replaces the original permission-or-clean-room criterion for this ticket.

## Drivers

- RJC-257 needs one exact, reproducible upstream reference rather than a moving branch or abbreviated commit.
- The public repository's root `UNLICENSED` status must not be represented as a grant of reuse rights.
- The historical Node, pnpm, Turbo, and Next tuple includes obsolete or security-affected values and cannot be promoted unchanged.
- The API and web surfaces are useful technical references, while mobile, docs, template, UI, and the two out-of-workspace plugins need explicit dispositions.
- The decision must remain reversible without laundering copied provenance.

## Alternatives

1. **Clean-room baseline from official sources.** Independently create the scaffold using official Medusa and Next documentation and generators. This remains the executable rollback.
2. **Wait for written upstream permission.** Pause direct reuse until 306 Technologies supplies explicit terms covering the pinned repository.
3. **Adopt the starter unchanged.** Rejected: it would conceal the unresolved license status and promote an insecure historical toolchain.

## Consequences

- Historical observations remain facts; they are stored separately from the selected production-reference matrix.
- The bounded spike must use Node `24.18.0`, pnpm `11.18.0`, Turbo `2.10.8`, Next `15.5.21`, web React/React DOM `19.1.2`, and Medusa `2.11.3`.
- Medusa `2.11.3` is a compatibility bridge, not a claim that it is current or production-approved.
- No upstream production feature source, dependency tree, or build output may be copied into this repository in RJC-256.
- Ryan's owner-authored Linear confirmation, the isolated spike, audit disposition, and conformance gates remain mandatory before closure.
- If the owner withdraws acceptance, upstream objects, review rejects the risk posture, or the pinned starter fails the spike, activate the clean-room rollback: supersede this direct-use decision and recreate the scaffold from official Medusa and Next sources without retaining copied starter code.

## Follow-up

RJC-257 may consume only the approved version matrix and migration map after RJC-256 closes. Any later written permission or license is new evidence; it must not rewrite this historical decision.
