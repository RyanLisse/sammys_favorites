# RJC-354 Telegram test-phase messaging evidence

## Outcome

RJC-354 is **partially evidenced**. A test-phase exchange over **long polling** recorded two live inbound updates and one successful outbound `sendMessage`, with every Telegram identifier retained only as a `sha256` digest ([2026-08-30 addendum](#2026-08-30-addendum-hashed-getupdates-and-sendmessage-receipts)).

This lane does **not** clear `G0`. Automated messaging stays disabled, `productionTraffic` stays false, and no credential material is in this repository.

Identity for this bot was recorded separately in [RJC-304](../rjc-304/README.md); this record covers message flow only.

## What this evidences

1. A real inbound update reached the bot from a private chat and was read back through `getUpdates`.
2. A second inbound update arrived in the same private chat. Only its length is recorded, never its content.
3. A real outbound `sendMessage` returned `ok: true` and produced a message identifier, hashed.

That is inbound receipt and outbound delivery over the polling transport. Nothing more.

## What this deliberately does not evidence

The transport was `getUpdates`, not a registered webhook. That boundary matters, because the receipts a webhook produces are exactly the ones still missing:

- **No secret-token comparison.** `webhook_configured` is still false, so no request ever carried an `X-Telegram-Bot-Api-Secret-Token` header. The authenticity check described in [ADR 0003](../../decisions/0003-telegram-channel-pivot.md) and proven synthetically in the RJC-304 fixture is untouched by this observation. Polling authenticates the *caller* — this repository calling Telegram — not the *sender* of an inbound request.
- **No deduplication proof.** A later `getUpdates` call still returned the original update identifier, which means no offset was committed and the update was never consumed. That is an offset observation. It is the opposite of duplicate suppression: it shows a redelivery is still possible, not that a redelivery would be ignored.
- **No durable receipt.** Nothing was minted through `WebhookVerificationRepository`, so `@sammys/policy` never saw a verification receipt for this exchange.

## Recorded facts

Observed 2026-08-30, Europe/Amsterdam. Timestamps are approximate to the second. The calls were made outside this repository; no bot token or secret is recorded here.

| Fact | Value |
| --- | --- |
| `method` | Telegram Bot API `getUpdates` + `sendMessage` |
| `transport` | long polling (not a webhook) |
| inbound 1 | `/start`, private chat, ~22:29:17 |
| inbound 1 update identifier | `sha256:5be311f056fa8d4929118f1cc628f95b9977af53c5722d49fe1f707ef666eca9` |
| inbound 2 | same private chat, `text_len` 3, ~22:29:24 |
| inbound 2 update identifier | `sha256:0eb94617bb8a4e522a85dcdc3b6c00e9121c17b58e29bc888db57fe13ee789d9` |
| outbound `sendMessage` | `ok: true`, ~22:29:59 |
| outbound message identifier | `sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce` |
| updates consumed | false, a later `getUpdates` still contained the original update identifier |
| `webhook_configured` | false |
| secret-token evidenced | false |
| `credentialMaterialPresent` | false |
| `productionTraffic` / `automatedMessagingEnabled` | false |
| `G0` | `blocked_external` |

The chat is identified only as "same private chat". No chat, user, bot, update, or message identifier appears here in numeric form, and no chat identifier hash was produced, so none is claimed.

Message content is limited to the literal `/start` command and the length of the second message. No other message text was recorded.

## Remaining receipts

- public HTTPS `setWebhook` registration with minimal `allowed_updates`;
- a real inbound webhook request carrying `X-Telegram-Bot-Api-Secret-Token`;
- the negative case, where a wrong or absent secret header is rejected;
- a duplicate update identifier suppressed against durable storage, with a business-effect count;
- a receipt minted for provider `telegram` through `WebhookVerificationRepository`.

Until those exist and are independently verified, automated messaging remains disabled and the fallback stays the authenticated Atelier surface plus manual customer communication.

## 2026-08-30 addendum: hashed getUpdates and sendMessage receipts

This addendum is **`provider_observed`**, not `public_documentation`. It records the first live Telegram *message-flow* receipts for RJC-354 without enabling messaging or clearing `G0`.

It supersedes nothing. The RJC-304 identity addendum stands unchanged, and its remaining-receipt list is narrowed only in that inbound receipt and outbound delivery have now been seen over polling. The webhook receipts it names are still outstanding.

Machine-readable record: [telegram-getupdates-sendmessage-2026-08-30.json](telegram-getupdates-sendmessage-2026-08-30.json). Fixture mirror: `test/fixtures/providers/rjc-354/telegram-getupdates-sendmessage-observation.json`, byte-identical to the evidence record.

## Verification

```sh
node --test docs/evidence/rjc-354/rjc-354-getupdates-sendmessage-evidence.test.mjs
node --test docs/evidence/rjc-304/rjc-304-getme-evidence.test.mjs
node --test test/p0-gate-report.test.mjs
shasum -a 256 -c docs/evidence/rjc-354/SHA256SUMS
```
