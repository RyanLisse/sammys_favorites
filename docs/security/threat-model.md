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
| SSRF | Outbound targets must be explicit HTTPS endpoints; loopback, link-local, private-network, credential-bearing, and malformed URLs are denied. |
| Webhook forgery | Webhook actions require verified provider signatures before processing. |
| Replay | The evaluator atomically consumes each approval nonce during successful execution authorization. A repeated or concurrent claim is denied. Production nonce consumption must use a durable atomic insert/claim. |
| Stale or altered approval | Execution recomputes the canonical SHA-256 hash over the full action binding and verifies proposal ID, schema version, action fields, hash, authorized actor, and both expiries. |
| Confused deputy | Grants bind principal, capability, stage, and narrow port; agents cannot call execute capabilities. |
| Secret disclosure | Secret-shaped fields are rejected from actions and recursively redacted from telemetry. |
| Emergency stop | Capability-specific and all-write kill switches are evaluated before authorization. |

## Canonical approvals

Proposal action bindings use RFC 8785/JCS JSON canonicalization and SHA-256. Lone UTF-16 surrogates and non-finite numbers are rejected. Approval records are deeply immutable values binding proposal ID, contract version, capability, stage, command/action type, resource and target, risk class, payload, human actor, expiry, and a high-entropy one-time nonce. Substituting any bound field invalidates the approval. An approval is evidence, not ambient authority: the executor still evaluates current grants and kill switches.

The evaluator requires an asynchronous atomic nonce store and performs the consume itself after all other checks pass. The in-memory implementation is for local tests only. A production implementation must atomically persist nonce consumption and the resulting audit receipt in infrastructure outside these domain packages.

## Audit expectations

Every authorization decision records actor, action, decision, reason code, timestamp, and resource identifier where applicable. Audit sinks accept typed receipts; sensitive values are redacted before append. Audit records must be access-controlled and append-only in production.
