# RJC-304 Telegram messaging evidence

## Outcome

RJC-304 is **partially evidenced**. The local fixture contract covers secret-token authenticity, subscription scope, `update_id` deduplication, and receipt minting. Live **getMe** identity is now recorded with a hashed bot id only ([2026-08-30 addendum](#2026-08-30-addendum-hashed-getme-identity-webhook-absent)); **getWebhookInfo** confirms no webhook is registered and no credential material is in this repository. Remaining live blockers are a public HTTPS callback with **setWebhook**, a real inbound update, negative secret-header rejection, duplicate **update_id** suppression, and an outbound **sendMessage** receipt. Automated messaging stays disabled and this lane does not clear **G0**.

The channel decision is [ADR 0003](../../decisions/0003-telegram-channel-pivot.md). The dated provider findings are in the [provider matrix addendum](../../feasibility/provider-evidence-matrix.md#2026-08-03-addendum-telegram-replaces-whatsapp).

The evidence-only candidate is pinned to:

- `chat@4.36.0`
- `@chat-adapter/telegram@4.36.0`

Observed on the public npm registry 2026-08-03: `4.36.0` is published from `github.com/vercel/chat` directory `packages/adapter-telegram`, depending exactly on `chat@4.36.0` and `@chat-adapter/shared@4.36.0`, `engines.node >=20`, published 2026-08-01. The package is **not installed**; this is a pinned candidate, not an integration.

## Why the authenticity check carries more weight here than it did for WhatsApp

Meta's `X-Hub-Signature-256` is an HMAC over the request payload. It proves origin **and** integrity, and the stored raw body can be re-verified later.

Telegram's `X-Telegram-Bot-Api-Secret-Token` is a shared bearer secret, documented as 1–256 characters of `A-Za-z0-9_-`. It proves the caller knows the secret. It does not bind to the body, and it leaves no artifact that can be re-verified after the request.

The comparison is therefore the entire authenticity check, and the fixture treats it that way:

- Both sides are digested to a fixed 32 bytes before `timingSafeEqual`. That keeps the comparison constant-time **and** avoids leaking the configured secret's length — either through a timing difference or through `timingSafeEqual` throwing on unequal buffer lengths.
- A secret shorter than 32 characters is refused outright. Telegram permits one character; accepting one would be indefensible when it is the only check standing between the endpoint and forged updates.
- An empty `allowed_updates` list is refused. Telegram documents an empty list as meaning *every* update type, which is the opposite of the intended minimum.

## What the fixture proves

1. Production construction fails closed; the candidate declares `productionTraffic: false`.
2. A usable `secret_token` is enforced on construction — charset, documented length bounds, and a minimum entropy floor.
3. An empty subscription list is rejected rather than silently widened to all update types.
4. An update carrying the registered secret header is accepted and mints a receipt shaped for `WebhookVerificationRepository.consumeVerifiedReceipt`.
5. A wrong, truncated, empty, or absent secret header is rejected.
6. An update type outside `allowed_updates` is rejected.
7. A repeated `update_id` is accepted once and then classified as a duplicate. Telegram documents `update_id` as existing precisely so a receiver can "ignore repeated updates or restore the correct update sequence, should they get out of order."
8. No rejected or duplicate outcome ever mints a receipt.

Property 7 additionally fails closed when an update carries more or fewer than one optional field. Telegram guarantees at most one, but a forged payload can carry several, and picking the first match would let a subscribed type shadow an unsubscribed one sitting beside it.

This is a synthetic local contract proof. It is not proof that the package is installed, that a webhook is registered, that a real update was received, or that Telegram delivered anything.

### What the deduplication does not prove

The fixture deduplicates in an in-process `Set`. That is enough to prove the decision rule — same `update_id`, accept once — and nothing more. It is not durable and not shared: a restart forgets every `update_id`, and two instances behind the same webhook would each accept the same update once.

Production deduplication is not this component's job. `docs/architecture.md` assigns durable delivery, idempotency, dead letters, and reconciliation to RJC-265, and `@sammys/policy` already consumes each verification receipt exactly once through `WebhookVerificationRepository`. The live RJC-304 captures must therefore evidence the duplicate decision against durable storage, not against this `Set`.

## Policy boundary

The receiver decides authenticity and duplication only. Authorization stays in `@sammys/policy`, which consumes the minted receipt through the unchanged `webhook.receive` fail-closed path.

That the channel could change cryptographic models without touching the policy layer is asserted in ADR 0003 and **proven** by `binds a webhook receipt to its provider, so a channel swap needs no policy change` in `packages/policy/test/policy.test.mjs`. That test also shows a `telegram` receipt is refused under a `stripe` expected provider, so receipts cannot cross channels.

## Exact external blockers

None of the following was available in this lane:

- a bot token issued by `@BotFather`;
- a public HTTPS callback able to receive a real update;
- a registered webhook, and therefore no `getWebhookInfo` receipt;
- any received update, and therefore no live secret-header comparison outcome;
- any outbound `sendMessage` delivery receipt.

Until those exist and are independently verified, automated messaging remains disabled and the fallback stays the authenticated Atelier surface plus manual customer communication.

## Resuming this lane

An accountable operator can produce the remaining receipts in an isolated session:

1. Create a bot with `@BotFather`. Store the token outside Git; it is a bearer credential for the whole bot identity.
2. Generate the `secret_token` from a CSPRNG. Never reuse the bot token as the secret.
3. Call `setWebhook` against a TLS endpoint with `secret_token` and a minimal `allowed_updates`. Pin `ip_address` where the deployment allows a fixed address.
4. Capture `getMe` and `getWebhookInfo`, retaining only non-secret fields with identifiers hashed.
5. Send one real inbound message. Record the comparison outcome, `update_id`, and timestamps — not the message content.
6. Replay the same `update_id`. Record the duplicate decision, the business-effect count, and the reconciliation result.
7. Send one outbound message and record the delivery receipt.
8. Have a second accountable reviewer sign the receipts before any lane status changes.

No customer is contacted at any step. No token, secret, chat content, or personal data enters the repository; identifiers are hashed.

## 2026-08-30 addendum: hashed getMe identity, webhook absent

Observed: 2026-08-30. Method: Telegram Bot API `getMe` + `getWebhookInfo` performed outside this repository; no bot token or secret is recorded here.

This addendum is **`provider_observed`**, not `public_documentation`. It records the first live Telegram identity receipt for RJC-354/RJC-304 without enabling messaging or clearing `G0`.

Recorded facts (verbatim, redacted):

- `retrievedAt`: 2026-08-30
- `method`: Telegram Bot API getMe + getWebhookInfo
- `getMe ok`: true
- `is_bot`: true
- `username`: Sammysfavorites_bot
- `first_name`: Daisy4sammy
- bot id retained only as `sha256:f3ba8c6512ad33f7f7fde99d2a1d8f4ada68e75f99f6b923e0b68f3dfd9f0caf` (sha256 of the numeric id string)
- `webhook configured`: false
- `pending_update_count`: 0
- `credentialMaterialPresent`: false
- `productionTraffic` / `automatedMessagingEnabled`: still false

This does **not** clear `G0`. Remaining live receipts: public HTTPS `setWebhook`, real inbound update, negative secret header, duplicate `update_id`, outbound `sendMessage`.

Machine-readable record: [telegram-getme-2026-08-30.json](telegram-getme-2026-08-30.json). Fixture mirror: `test/fixtures/providers/rjc-304/telegram-getme-observation.json`.

## Verification

```sh
node --test test/fixtures/providers/rjc-304/conformance.test.mjs
node --test docs/evidence/rjc-304/rjc-304-getme-evidence.test.mjs
node --test test/p0-gate-report.test.mjs
pnpm --filter @sammys/policy run test
shasum -a 256 -c docs/evidence/rjc-304/SHA256SUMS
```
