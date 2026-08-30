# RJC-303 pinned Chat SDK adapter evidence

## Outcome

RJC-303 is **partially evidenced**. The local, redacted fixture contract covers identity, threading, status progression, duplicates, failures, commerce-authorization separation, and production fail-closed behavior. Live WhatsApp/Meta conformance remains externally blocked, so this evidence does not authorize production traffic.

The evidence-only candidate is pinned to:

- `chat@4.36.0`
- `@chat-adapter/whatsapp@4.36.0`
- Meta Graph API `v25.0` explicitly
- upstream release commit `470b6af94b9d6c9a7b75cb3cbd9c7f7f6edc820f`

The adapter's published metadata depends exactly on `chat@4.36.0` and `@chat-adapter/shared@4.36.0`; both candidate packages require Node 20 or newer. Package integrity values and official sources are recorded in [candidate-matrix.json](candidate-matrix.json).

## Compatibility finding

The current rendered Chat SDK WhatsApp page states that the default Graph API version is `v21.0`. The pinned `4.36.0` release source and its published npm tarball both set `DEFAULT_API_VERSION` to `v25.0`. Meta's official v25 changelog records release on 2026-02-18 and availability until TBD. This evidence therefore selects `v25.0` explicitly and treats the rendered documentation mismatch as a release-readiness risk.

The current official Chat SDK WhatsApp page does not label the adapter Beta. Earlier repository feasibility text did, but that status was not reconfirmed on 2026-08-01 and is not used here as a current claim.

## Local fixture boundary

Run:

```sh
node --test test/fixtures/providers/rjc-303/conformance.test.mjs
```

The fixture uses only `sha256:` identifiers. It contains no phone numbers, customer identifiers, credentials, tokens, app secrets, webhook secrets, or live payloads.

The fixture and machine-readable evidence hashes are frozen in [SHA256SUMS](SHA256SUMS).

The tests establish these local contract properties:

1. Production construction fails closed and the candidate declares `productionTraffic: false`.
2. Channel identity is scoped by provider, hashed phone-number asset, and hashed user identity.
3. Thread IDs follow the official `whatsapp:{phoneNumberId}:{userWaId}` shape using only fixture hashes.
4. A repeated provider message hash is accepted once and then classified as a duplicate.
5. Delivery state advances monotonically through accepted, sent, delivered, and read; provider failure is terminal.
6. Invalid signatures and unredacted identity input fail closed.
7. A channel identity, claimed role, or message saying `APPROVE` never grants commerce authority. Only a separate authenticated, action-bound receipt from the trusted Atelier surface satisfies the fixture policy boundary.

This is a synthetic local contract proof. It is not proof that the upstream package has been installed, that a real webhook is authentic, or that Meta accepted or delivered a message.

## Exact external blockers

The following external authority and credentials were not available in this lane:

- an approved Meta Business app and WhatsApp Business Account;
- verified ownership of the selected phone-number asset;
- least-privilege permanent system-user token and observed provider grants;
- Meta app secret and independently held webhook verification token;
- public HTTPS callback and subscribed `messages` webhook field;
- approved template and verified 24-hour customer-service-window behavior;
- live signed webhook, duplicate/replay delivery, outbound delivery receipts, failure receipts, consent, and opt-out evidence.

Until those items are supplied and independently verified, Chat SDK production traffic remains disabled and Atelier/manual customer communication remains the fallback.

## Scope statement

No product code, package manifest, lockfile, CI configuration, Linear state, branch, commit, or remote was modified. The candidate packages were inspected through official documentation, npm metadata/tarballs, upstream tagged source, and Meta documentation only; they were not installed into the repository.
