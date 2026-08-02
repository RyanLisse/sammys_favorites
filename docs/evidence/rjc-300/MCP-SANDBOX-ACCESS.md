# RJC-300 authenticated Stripe MCP observation

Status: **authenticated account access observed; authoritative sandbox and provider-flow evidence externally blocked**.

On 2026-08-02 the official Stripe MCP connection successfully read an account whose display name was `Sammy's Favorites sandbox`. A mutable display name is not an authoritative test-mode signal. The MCP response was observed in-session but was not available as an immutable provider-signed artifact. The receipt stores only a SHA-256 digest of the account identifier. No API key, signing secret, authorization header, or raw account identifier is stored.

Read-only inventory returned:

- zero PaymentIntents;
- zero webhook endpoints.

The connected API catalog did not expose a PaymentIntent create operation. It did expose webhook-endpoint creation, but that write was intentionally not invoked because no isolated callback URL, signing-verification path, or provider-activation receipt was available.

This observation upgrades the original local-only preflight by recording an authenticated account read and empty provider inventory. It does not independently prove sandbox mode, sandbox owner identity, the Dashboard test-mode indicator, a PaymentIntent lifecycle, a signed webhook, duplicate-delivery idempotency, reconciliation, or accountable Human Review. Checkout remains disabled.

## Verification

The SHA-256 manifest is a local consistency checksum. It detects drift relative to the checked-in manifest but is not an independently signed or provider-originated tamperproof receipt. Until a commit or external signed artifact exists, it must not be described as immutable provider evidence.

```sh
node --test docs/evidence/rjc-300/rjc-300-mcp-evidence.test.mjs
shasum -a 256 -c docs/evidence/rjc-300/mcp-evidence.sha256
```
