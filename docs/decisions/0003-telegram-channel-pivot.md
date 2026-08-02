# ADR 0003: Telegram replaces WhatsApp as the automated messaging channel

- Status: Accepted; supersedes the Meta WhatsApp Cloud channel selection
- Date: 2026-08-03
- Decided by: Ryan Lisse (accountable coordinator)
- Issue: RJC-304
- Architecture map: [Sammy's Favorites architecture](../architecture.md)
- Superseded evidence lane: [RJC-301](../feasibility/provider-evidence-matrix.md)

## Context

`G0` is blocked on four provider lanes. Three of them are blocked on evidence that Sammy's Favorites can produce for itself. One is blocked on a third party's review queue.

The Meta WhatsApp Cloud lane requires a business portfolio, a WhatsApp Business Account, a registered and owned sender phone number, completed app review, granted `whatsapp_business_messaging` and `whatsapp_business_management` permissions, an approved utility template, and observed 24-hour customer-service-window behaviour. Every one of those is issued by Meta. None of them has a date Sammy's Favorites controls, and none of them has a guaranteed outcome. RJC-301 recorded the lane as `blocked_external` on 2026-08-01 with no provider receipt of any kind.

The Telegram Bot API requires a bot token from `@BotFather`. There is no business verification, no account asset to own, no app review, no permission grant, no template approval process, and no messaging window. The entire credential chain is self-serviceable in minutes, which means the lane's evidence — signed-by-secret webhook delivery, duplicate handling, delivery status — can actually be produced rather than waited for.

Observed 2026-08-02/03 against official sources: `@chat-adapter/telegram@4.36.0` is published on the same version line as the WhatsApp adapter, from the same `github.com/vercel/chat` repository, depending exactly on `chat@4.36.0` and `@chat-adapter/shared@4.36.0`, requiring Node 20 or newer.

## Decision

Telegram replaces WhatsApp as the automated messaging channel for Sammy's Favorites.

1. The pinned adapter candidate becomes `@chat-adapter/telegram@4.36.0` against `chat@4.36.0`. `@chat-adapter/whatsapp` is not installed and not a target.
2. Webhook authenticity uses the `secret_token` registered through `setWebhook` and compared in constant time against the `X-Telegram-Bot-Api-Secret-Token` request header.
3. Duplicate suppression keys on `update_id`, which the official API documents as existing so that a receiver "can ignore repeated updates or restore the correct update sequence, should they get out of order."
4. `allowed_updates` is set to the minimum set the product consumes. An empty list — meaning "all update types" — is not acceptable.
5. Automated messaging stays **disabled** until the RJC-304 receipts exist. This ADR changes which channel is being evidenced; it does not clear a gate.
6. WhatsApp is removed as a channel. The RJC-301 and RJC-303 records of it are **retained unchanged** as dated observations.

## The cost, stated plainly

WhatsApp is close to universal in the Netherlands. Telegram is not. This decision trades customer reach for a gate that Sammy's Favorites can actually close.

That trade rests on an assumption which **has not been tested**: that the customers Samantha needs to reach will accept Telegram as the channel. No customer research, no opt-in sample, and no conversion evidence supports it today. It is recorded here as an assumption rather than a finding, and it is the item most likely to force a revision of this ADR.

The fallback is unchanged and unaffected either way: the authenticated Atelier surface remains the operating surface, and manual customer communication remains available regardless of which automated channel exists.

## Security consequence: a bearer secret is not a signature

Meta's `X-Hub-Signature-256` is an HMAC over the request payload. It proves both **origin** and **payload integrity**, and it leaves a per-message artifact that can be re-verified later from the stored raw body.

Telegram's `X-Telegram-Bot-Api-Secret-Token` is a shared bearer secret, 1–256 characters from `A-Za-z0-9_-`. It proves the caller knows the secret. It does **not** bind to the payload, and it produces no per-message artifact that survives the request.

Consequences that follow, and that the RJC-304 evidence must reflect:

- The secret is high-entropy, generated from a CSPRNG, stored outside Git, and rotated on any suspicion of exposure. Anyone holding it can forge arbitrary updates.
- Comparison is constant-time. A naive string equality is a timing oracle against a bearer credential.
- Payload integrity rests on TLS alone. The endpoint therefore terminates TLS properly and rejects plaintext.
- `ip_address` pinning on `setWebhook` is available as defence in depth and should be used where the deployment allows a fixed address.
- The stored receipt records the verification **outcome**, timestamps, and `update_id` — it cannot record a re-verifiable signature, because none exists. That difference is a downgrade in auditability and is accepted knowingly, not overlooked.

## No change required in `@sammys/policy`

`WebhookVerificationRepository.consumeVerifiedReceipt` consumes a receipt keyed on `provider` and `bindingSha256`. The policy layer never performs the cryptography itself; verification happens upstream in the adapter, which mints the receipt.

A Telegram constant-time header comparison therefore mints a receipt with `provider: "telegram"` and the existing `UNTRUSTED_WEBHOOK` fail-closed path applies unchanged. The `webhook.receive` capability, its `execute` stage binding, and the single-use receipt consumption all keep working as written.

This is recorded because it is exactly the kind of property that gets re-investigated later: the port boundary already absorbed a provider swap with a different cryptographic model, at a cost of zero lines in `packages/policy`.

## Non-goals

- Enabling automated messaging. The flag stays false until RJC-304 receipts exist.
- Claiming Telegram is a better product channel than WhatsApp. It is a faster-to-evidence one.
- Deleting, rewriting, or downgrading the RJC-301 and RJC-303 records.
- Adding a second messaging channel. WhatsApp is removed, not deferred behind a flag.
- Changing the AliExpress or Stripe lanes, or `p1AndP2MayStart`.

## Supersession and rollback

This ADR supersedes the Meta WhatsApp Cloud channel selection recorded in RJC-261 and the provider evidence matrix. The superseded sections stay in place with a supersession marker; their dated observations are append-only records of what was known on 2026-08-01 and are not edited.

Rollback is cheap while automated messaging is disabled: no provider asset has been acquired, no template submitted, and no customer contacted on either channel. Reversing to WhatsApp requires a new ADR and re-entering Meta's review queue from the beginning.

If the untested reach assumption above is disproved — customers will not use Telegram — this ADR must be revisited rather than worked around with a second channel added quietly.

## Official references

- [Telegram Bot API — `setWebhook`, `getWebhookInfo`, `Update.update_id`](https://core.telegram.org/bots/api)
- [Chat SDK Telegram adapter](https://chat-sdk.dev/adapters/official/telegram)
- [Chat SDK documentation](https://chat-sdk.dev/docs)
