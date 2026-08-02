# RJC-301 Meta/WhatsApp evidence lane

## Result

Acceptance is **partially evidenced and externally blocked** as of 2026-08-01T20:44:29Z. Public Meta documentation was reachable, and the local evidence contract is tested. No supplied credentials, Business Manager export, WABA receipt, phone-number receipt, token debug output, approved-template export, consent record, signed webhook delivery, or delivery-status receipt was available in this worktree.

This package does not establish ownership, entitlement, template approval, provider delivery, or production readiness. Automated WhatsApp remains disabled. The fallback is authenticated Atelier workflows plus manual customer communication. No customer message was sent and no provider or Linear state was mutated.

## Exact external blocker

An authorized operator must access the Sammy's Favorites Meta Business Manager / WhatsApp Manager and provide redacted receipts for the business portfolio, WABA, registered sender, reviewed permissions, approved utility template, customer consent and opt-out flow, and a controlled webhook test. Raw IDs must be replaced by stable SHA-256 values before entering the repository; tokens, secrets, phone numbers, customer content, and personal data must not be stored.

The controlled webhook test must include the GET verification outcome; valid and invalid `X-Hub-Signature-256` outcomes; the `messages` subscription; hashed inbound/outbound message and delivery IDs; delivery-status reconciliation; and duplicate/retry handling. The operator must also record behavior inside and outside the 24-hour customer-service window without contacting a real customer.

## Evidence classification

- `provider_observed`: requires an actual redacted provider receipt. None is present.
- `public_documentation`: documents constraints but proves no project-specific entitlement or behavior.
- `external_blocker`: records the exact missing authority and receipt fields. It is not a synthetic pass.

See `acceptance-matrix.json` for the fail-closed decision and `test/fixtures/providers/rjc-301/` for the receipt contracts/blockers.

## Official source readback

The following official URLs returned HTTP 200 on 2026-08-01; reachability is not provider acceptance:

- https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
- https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in

## Focused verification

Run from the repository root:

```sh
node --test docs/evidence/rjc-301/rjc-301-evidence.test.mjs
```
