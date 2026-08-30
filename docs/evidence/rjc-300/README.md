# RJC-300 Stripe sandbox evidence

Current status (2026-08-02): **blocked on authoritative Stripe sandbox and provider-flow evidence**.

This README primarily describes the original 2026-08-01 local preflight. A later authenticated MCP read is recorded separately in [`MCP-SANDBOX-ACCESS.md`](./MCP-SANDBOX-ACCESS.md). That read observed access to an account whose display name contains `sandbox`, but a mutable display name is not an authoritative test-mode signal and the MCP response was not captured as an immutable provider artifact. The original receipt remains preserved; the later observation does not clear any RJC-300 provider-flow acceptance item.

This directory records the 2026-08-01 evidence attempt for RJC-300. It does not prove Stripe account ownership, a PaymentIntent, signed webhook verification, duplicate-delivery idempotency, or reconciliation. No provider request was attempted and no provider receipt exists.

## Verified locally

- The branch and revision match the assigned RJC-300 worktree.
- No Stripe CLI executable was available.
- No Stripe credential environment variable names were present.
- No Stripe CLI configuration file was present at the standard local paths checked.
- No repository `.env*` file referenced Stripe.
- The issue-local receipt contains no Stripe secret-shaped values.

Only environment variable names and file metadata were inspected; no secret values were printed or stored.

## Exact blocker for the original 2026-08-01 capture

The execution context has no authenticated access to the actual Sammy's Favorites Stripe sandbox. Account ownership and test-mode access cannot be verified, so creating a PaymentIntent or collecting a real signed webhook would be unauthorized. Checkout must remain disabled.

The machine-readable blocker is [`blocker-receipt.json`](./blocker-receipt.json). Its expected blocked-state shape is defined by [`evidence-contract.json`](../../../test/fixtures/providers/rjc-300/evidence-contract.json). Both are pinned by [`evidence.sha256`](./evidence.sha256).

The historical 2026-08-01 command log remains in [`test-runs.json`](./test-runs.json). The current post-MCP local verification is recorded separately in [`test-runs-2026-08-02.json`](./test-runs-2026-08-02.json); that run log is not an independently signed provider receipt.

## Safe manual fallback

An accountable sandbox owner can resume this evidence lane in an isolated session:

1. Authenticate to the actual Sammy's Favorites Stripe account and visibly confirm **test mode** plus the account identifier. Do not paste API keys, restricted keys, webhook signing secrets, or session tokens into Git or Linear.
2. Record the accountable reviewer, UTC timestamp, account identifier as a one-way hash, and the dashboard's test-mode indicator.
3. Create one test PaymentIntent through the intended test payment-method path. Preserve only its non-secret provider receipt ID, test-mode flag, amount/currency, payment-method type, status, and timestamps.
4. Deliver a real Stripe test event to an isolated endpoint and verify the raw payload with the endpoint signing secret in memory. Store only the event ID, event type, test-mode flag, verification result, and timestamps; never store the secret or raw authorization headers.
5. Redeliver the exact same event ID. Capture one business effect, the duplicate/no-op decision, idempotency record key or hash, audit timestamp, and deterministic reconciliation result.
6. Have a second accountable reviewer compare the evidence with Stripe's test-mode dashboard and sign off. Link immutable, hashed evidence from RJC-261 before changing only the Stripe lane from blocked.

Until all steps are completed with real provider receipts, RJC-300 acceptance remains partial and does not authorize production checkout or P1/P2 implementation.

## Verification

Run:

```sh
node --test docs/evidence/rjc-300/rjc-300-evidence.test.mjs
shasum -a 256 -c docs/evidence/rjc-300/evidence.sha256
```
