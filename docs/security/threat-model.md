# Phase 0 security and authority model

Status: clean-room implementation baseline for RJC-258 and RJC-260.

## Trust boundaries

- Agents may read approved projections, draft changes, and submit proposals. They never receive generic SQL, HTTP, browser, Medusa Admin, or supplier order-write capabilities.
- A human approves the exact canonical action binding: capability, stage, command/action type, resource ID and target, risk class, and payload. A separate trusted service validates and executes that approval through a narrow workflow or supplier port.
- Provider webhooks, supplier data, product copy, chat messages, and other remote content are untrusted input. Their text cannot expand authority.
- Secrets remain in the execution environment and are redacted from audit payloads. They are not proposal input, agent context, or application logs.

## Required controls

| Threat | Control and fail-closed behavior |
| --- | --- |
| Prompt injection | Privileged propose/execute actions carrying untrusted instructions are denied. Input never changes grants. |
| SSRF | Every outbound capability validates the target directly from the canonical action binding. Omitting a separate URL hint cannot bypass validation. Targets must be explicit HTTPS endpoints; loopback, link-local, private-network, credential-bearing, and malformed URLs are denied. |
| Webhook forgery | Webhook actions require verified provider signatures before processing. |
| Replay | The evaluator requires the repository to atomically claim the verified approval while persisting the execution intent, outbox message, and allow audit receipt. A new idempotency key is denied; the same key returns the original claim for safe retry. |
| Stale or altered approval | Execution recomputes the canonical SHA-256 hash over the full action binding and verifies proposal ID, schema version, action fields, hash, authorized actor, and both expiries. |
| Confused deputy | Grants bind principal, capability, stage, and narrow port; agents cannot call execute capabilities. |
| Secret disclosure | Secret-shaped fields are rejected from actions and recursively redacted from telemetry. |
| Emergency stop | Capability-specific and all-write kill switches are evaluated before authorization. |

## Canonical approvals

Proposal action bindings use RFC 8785/JCS JSON canonicalization and SHA-256. Lone UTF-16 surrogates and non-finite numbers are rejected. Approval records are deeply immutable values binding proposal ID, contract version, capability, stage, command/action type, resource and target, risk class, payload, human actor, expiry, and a high-entropy one-time nonce. Substituting any bound field invalidates the approval. An approval is evidence, not ambient authority: the executor still evaluates current grants and kill switches.

The evaluator accepts only an approval ID, never a caller-supplied approval record. The repository returns an immutable stored approval only after provenance verification; the reference verifier uses a trusted-key HMAC and therefore covers the actor identity as well as the full binding. Changing the actor or any bound field invalidates the signature.

Authorization of privileged execution cannot be separated from durable work creation. The repository transaction revalidates the immutable revision and binding, claims the approval, and persists the execution intent, outbox message, and audit receipt together. The returned claim is the only successful execution authorization. Completion is idempotent; an identical retry succeeds, while a conflicting completion fails. The in-memory repository is for local tests only. A production repository must implement the same interface with one durable database transaction and an idempotent outbox consumer.

## Audit expectations

Every authorization decision records actor, action, decision, reason code, timestamp, and resource identifier where applicable. Audit sinks accept typed receipts; sensitive values are redacted before append. Audit records must be access-controlled and append-only in production.
