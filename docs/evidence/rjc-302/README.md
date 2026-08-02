# RJC-302 AliExpress Open Platform evidence

Status at 2026-08-01: **partially evidenced and externally blocked**.

This lane verified that the official public documentation endpoints for the five required API paths returned HTTP 200 and bound each retained, deterministically redacted response body to a SHA-256 digest in `official-docs-manifest.json`. The docs repeat a public sample `access_token` value; that sample is replaced before retention. No storefront was scraped, no authenticated provider API was called, no credential was read or written, and no order was placed.

## What this proves

- The official Open Platform documentation currently publishes endpoints for product, freight, order creation, order detail and tracking.
- The retained public documentation responses match their recorded byte lengths and hashes; each response also contains its declared API path.
- This lane does not inspect or claim repository-wide supplier-port implementation or configuration. It records only that no supplier write was attempted and that the evidence fallback contract keeps automated supplier writes unauthorized until external authority and lifecycle receipts exist.

It does **not** prove application ownership, application approval, granted scopes, account limits, exact-SKU data, a fresh freight quote, ordering eligibility, idempotent provider behavior or an order/tracking lifecycle.

## Exact external blockers

1. An authorized AliExpress Open Platform owner must supply a dated, redacted application-ownership and approval receipt.
2. The owner must supply the exact granted API paths, account-specific quotas, region and program eligibility.
3. An approved exact listing/SKU, quantity, origin and redacted destination must be designated for authenticated product and freight reads.
4. The provider or authorized owner must establish an eligible non-production order facility. If none exists, an official account-specific statement of that unavailability is required.
5. Explicit external authority is required before any create-order action. This lane has no such authority and must not place or pay for an order.

Until all blockers are cleared, Samantha performs supplier ordering and tracking manually. Each reconciliation must compare the approved exact SKU, quantity, price/currency, freight, supplier order reference and tracking transitions, with mismatches recorded by reason, operator decision, time and receipt hash.

## TDD and verification

The first test run was intentionally red because the manifest and fixture did not exist: 3 tests, 0 passed, 3 failed with `ENOENT`. The focused command is:

```sh
node --test docs/evidence/rjc-302/rjc-302-evidence.test.mjs
```

The test checks acceptance-state honesty, required API-documentation hashes, manual fallback/write disablement and absence of credential-shaped material in the RJC-302 allowlisted files.
