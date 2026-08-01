# RJC-261 provider feasibility: independent official-source check

Observed: 2026-08-01 (Europe/Amsterdam)
Scope: Stripe sandbox/webhooks, Meta WhatsApp Business Cloud, Vercel Chat SDK, and AliExpress Open Platform
Method: public official documentation only; no credentials, account dashboards, sandbox calls, provider mutations, code changes, or Linear changes

## Decision

`G0` remains `blocked_external`. Public documentation establishes that the intended capabilities exist, but it does not establish that Sammy's Favorites owns the required accounts/assets, has the required grants, or has completed a real signed end-to-end exchange. Documentation reachability is not onboarding or sandbox evidence.

The safe runtime position remains:

- Stripe checkout and payment collection disabled.
- Automated WhatsApp disabled; authenticated Atelier workflows plus manual customer communication.
- Chat SDK WhatsApp adapter disabled; local fixtures only.
- AliExpress order writes disabled; Samantha performs supplier ordering and tracking manually.

## Provider findings

### Stripe

Documented capability:

- Stripe sandboxes simulate transactions without moving funds and use test API keys.
- Stripe recommends restricted keys with only the privileges a component needs and storing secret/restricted keys outside source code.
- Webhook verification requires the unmodified payload, the `Stripe-Signature` header, and the endpoint-specific signing secret.
- Stripe documents duplicate delivery handling using processed event IDs. Its signed timestamp supports replay rejection; official libraries default to a five-minute tolerance, and a retry receives a new signature and timestamp.

Unavailable proof:

- No account/sandbox access receipt, restricted-key policy, test PaymentIntent result, registered endpoint, real endpoint-secret signature, duplicate receipt, or stale/replay rejection receipt was available.
- Local fixtures cannot prove provider delivery, account configuration, or secret custody.

Minimum evidence to clear the Stripe portion of G0:

1. Redacted account receipt showing sandbox access and a restricted sandbox key policy limited to the resources/actions actually used.
2. Successful test PaymentIntent lifecycle receipt, with no live funds and secrets excluded.
3. Registered sandbox webhook endpoint and selected event-type list.
4. Real signed delivery verified against the unmodified body and endpoint secret.
5. Evidence that a duplicate event is idempotently ignored and an out-of-tolerance signed delivery is rejected.

Fallback: checkout and payment collection stay disabled.

### Meta WhatsApp Business Cloud

Documented capability:

- Current Meta setup requires a Meta app connected to a business portfolio and WhatsApp Business Account (WABA), plus a sender/test phone-number setup.
- The official getting-started flow identifies `whatsapp_business_messaging` and `whatsapp_business_management`. The public docs do not prove that either permission is granted to this project or that the selected app-review path is complete.
- A user message or call opens a 24-hour customer-service window and resets that timer. Free-form service messages are allowed while it is open. Outside the window, only pre-approved templates can be sent.
- Templates are WABA assets. They are reviewed on creation/edit and must be `APPROVED` to be sent.
- Webhook setup uses a callback URL and verify token for the GET challenge. POST authenticity uses `X-Hub-Signature-256`, an HMAC-SHA256 over the payload using the Meta app secret. The app subscribes to individual fields; the `messages` field covers inbound messages and outbound delivery status. Meta warns that retries can create duplicate notifications.

Unavailable proof:

- No business-portfolio, WABA, phone-number ownership, app-review, permission-grant, system-user-token, approved-template, consent/opt-out, service-window, signed-webhook, delivery-status, or retry/duplicate receipt was available.
- A reachable Meta documentation page is not evidence of a production-capable token or provider delivery.

Minimum evidence to clear the Meta portion of G0:

1. Redacted ownership receipts for the business portfolio, WABA, and registered sender phone number.
2. Observed least-privilege token grants, including the exact permissions actually granted and their review state.
3. Approved utility template and a recorded test inside and outside the 24-hour service window.
4. Consent and opt-out evidence for the chosen customer flow.
5. GET verification receipt plus valid and invalid `X-Hub-Signature-256` POST receipts.
6. `messages` subscription, inbound/outbound delivery-status reconciliation, and duplicate-retry handling evidence.

Fallback: Atelier remains the authenticated operating surface and communication remains manual.

### Vercel Chat SDK

Documented capability:

- The identifiable Chat SDK is Vercel's TypeScript library at `chat-sdk.dev` with platform adapters that parse webhooks, format messages, and make provider API calls.
- Its adapter catalog currently labels `@chat-adapter/whatsapp` as an official **Beta** WhatsApp Business Cloud adapter.
- The adapter documentation requires a WhatsApp access token, app secret, phone-number ID, and verify token. It documents the GET verification handshake, POST `X-Hub-Signature-256` verification, subscription to the `messages` field, and pre-approved template sending outside the 24-hour window.
- The adapter documentation currently shows `v21.0` as its default Graph API version, while current Meta documentation examples and references use newer Graph versions. This is a compatibility question to verify, not proof that the adapter is unusable.

Boundary and unavailable proof:

- Chat SDK is an implementation adapter, not a provider entitlement. It does not grant Meta permissions, establish WABA/phone ownership, approve templates, or prove webhook authenticity/delivery for Sammy's Favorites.
- No pinned adapter version, selected/supported Graph API version receipt, lockfile receipt, fixture conformance, deployed webhook, or live inbound/outbound exchange was available.
- Because the adapter is marked Beta, adoption also needs a pinned-version review and explicit conformance evidence; documentation alone is insufficient.

Minimum evidence to clear this implementation portion:

1. Pinned `chat` and `@chat-adapter/whatsapp` versions with reviewed dependency/build-script policy.
2. An explicitly selected Meta Graph API version with evidence that both Meta and the pinned adapter version support it.
3. Adapter conformance for valid/invalid signatures, verification challenge, duplicates/replay, attachments/size limits, interactive responses, templates, and provider status mapping.
4. A deployed end-to-end test using the approved Meta assets from the preceding gate.

Fallback: keep the adapter absent/disabled and exercise proposal flows with local fixtures only.

### AliExpress Open Platform

Documented capability:

- The current official public API catalog contains an `AE-Dropshipper` category and documents:
  - `aliexpress.ds.product.get`: product and exact-SKU data including `sku_id`, SKU attributes, SKU inventory, price, and currency.
  - `aliexpress.ds.freight.query`: delivery options including service code, shipping fee/currency, available SKU stock, origin country, tracking availability, and delivery estimates.
  - `aliexpress.ds.order.create`: an order-create-and-pay API; its request includes product/SKU data and an `out_order_id` described as being used for idempotent checkout.
  - `aliexpress.trade.ds.order.get`: buyer order details and order/logistics status.
  - `aliexpress.ds.order.tracking.get`: tracking nodes, timestamps, carrier data, SKU/item data, and the AliExpress order ID.
- The detail responses require common authentication parameters: an `app_key` issued when applying for an app category, `access_token`, timestamp, `sign_method`, and request `sign`.

Boundary and unavailable proof:

- The public catalog proves that API definitions exist; it does not prove application approval, Dropshipper eligibility, an app key/secret, token authorization, the exact APIs granted to this application, regional availability, rate limits for the account, or access to a non-production order facility.
- No generic public scope string should be inferred. The clearance artifact must be the exact application/API grant list observed in the authenticated Open Platform console.
- No product, exact-SKU, freight, create-order, order-detail, or tracking call was made. Scraping storefront pages is not an acceptable substitute.

Minimum evidence to clear the AliExpress portion of G0:

1. Redacted application identity, approval/eligibility state, app-key/secret custody, and authorized-token receipt.
2. Captured exact granted API paths and account-specific limits for product, freight, order creation, order detail, and tracking.
3. Exact-SKU product response and fresh freight response for the intended destination, including price/currency/stock timestamps and error/rate-limit behavior.
4. Non-production order/create-detail-tracking lifecycle if the provider supplies an eligible test facility.
5. If no non-production facility exists, a separately authorized, Human-Reviewed minimal live proof with bounded spend and rollback; absence of that authority keeps writes disabled.

Fallback: no scraping and no supplier writes; Samantha orders and tracks manually.

## CI-readable evidence-gap proposal

The following JSON is a proposal for the authoritative gate artifact. It intentionally records external gaps rather than treating documentation as proof.

```json
{
  "schemaVersion": 1,
  "asOf": "2026-08-01",
  "issue": "RJC-261",
  "gate": "G0",
  "status": "blocked_external",
  "documentationReview": "pass",
  "sandboxProof": "missing",
  "providers": {
    "stripe": {
      "documentedCapability": "pass",
      "accountOrSandboxProof": "missing",
      "requiredEvidenceIds": [
        "stripe.sandbox.access",
        "stripe.restricted_key.policy",
        "stripe.payment_intent.test_lifecycle",
        "stripe.webhook.real_signature",
        "stripe.webhook.duplicate_idempotency",
        "stripe.webhook.stale_rejection"
      ],
      "fallback": "checkout_disabled"
    },
    "metaWhatsApp": {
      "documentedCapability": "pass",
      "accountOrSandboxProof": "missing",
      "requiredEvidenceIds": [
        "meta.business_portfolio.ownership",
        "meta.waba.ownership",
        "meta.phone_number.registration",
        "meta.permissions.observed_grant",
        "meta.template.approved",
        "meta.customer_service_window.behavior",
        "meta.consent_and_opt_out",
        "meta.webhook.challenge_and_signature",
        "meta.delivery_and_duplicate_reconciliation"
      ],
      "fallback": "atelier_manual_communication"
    },
    "chatSdk": {
      "documentedCapability": "pass_beta",
      "integrationProof": "missing",
      "requiredEvidenceIds": [
        "chat_sdk.versions.pinned",
        "chat_sdk.meta_graph_version.compatibility",
        "chat_sdk.whatsapp_adapter.conformance",
        "chat_sdk.whatsapp_adapter.end_to_end"
      ],
      "fallback": "adapter_disabled_local_fixtures"
    },
    "aliExpress": {
      "documentedCapability": "pass",
      "accountOrSandboxProof": "missing",
      "requiredEvidenceIds": [
        "aliexpress.application.approval_and_eligibility",
        "aliexpress.credentials.custody",
        "aliexpress.api_paths.observed_grants",
        "aliexpress.product.exact_sku",
        "aliexpress.freight.fresh_quote",
        "aliexpress.order.create_detail_tracking_lifecycle"
      ],
      "fallback": "manual_supplier_ordering_and_tracking"
    }
  },
  "featureFlags": {
    "livePaymentsEnabled": false,
    "automatedWhatsAppEnabled": false,
    "chatSdkWhatsAppAdapterEnabled": false,
    "supplierOrderWritesEnabled": false
  },
  "p1AndP2MayStart": false
}
```

## Verified official sources

Every URL below returned HTTP 200 on 2026-08-01 and its response content supported the associated observation. Meta's legacy `/docs/whatsapp/cloud-api/...` URLs now redirect to the current `/documentation/business-messaging/whatsapp/...` locations, so the effective URLs are recorded here.

### Stripe

- https://docs.stripe.com/testing — sandbox/test values do not move funds; test API keys are required.
- https://docs.stripe.com/keys-best-practices — secret custody, least privilege, and restricted API keys.
- https://docs.stripe.com/webhooks/signature — raw body, `Stripe-Signature`, and endpoint secret.
- https://docs.stripe.com/webhooks — duplicate event IDs, signed timestamps, default five-minute tolerance, and retry signatures.

### Meta WhatsApp Business Cloud

- https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started — business portfolio/WABA/phone setup and WhatsApp permissions.
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages — service messages and the 24-hour customer-service window.
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview — template assets, review, and `APPROVED` send status.
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview — field subscriptions, the `messages` field, status delivery, and duplicate retries.
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint — GET verification and HMAC-SHA256 `X-Hub-Signature-256` validation.

### Vercel Chat SDK

- https://chat-sdk.dev/docs — SDK boundary, unified interface, and platform-adapter role.
- https://chat-sdk.dev/adapters — official adapter catalog; WhatsApp Business Cloud is marked Beta.
- https://chat-sdk.dev/adapters/official/whatsapp — adapter credentials, webhook flow, `messages` subscription, and template behavior.

### AliExpress Open Platform

- https://open.aliexpress.com/doc/api.htm — current official API reference shell/catalog.
- https://open.aliexpress.com/handler/share/apidoc/getApi.json?cid=21038&path=aliexpress.ds.product.get&methodType=GET%2FPOST — exact-SKU product fields and required common authentication parameters.
- https://open.aliexpress.com/handler/share/apidoc/getApi.json?cid=21038&path=aliexpress.ds.freight.query&methodType=GET%2FPOST — fresh delivery/freight options and required common authentication parameters.
- https://open.aliexpress.com/handler/share/apidoc/getApi.json?cid=21038&path=aliexpress.ds.order.create&methodType=GET%2FPOST — order create/pay, idempotent outer order ID, and required common authentication parameters.
- https://open.aliexpress.com/handler/share/apidoc/getApi.json?cid=21038&path=aliexpress.trade.ds.order.get&methodType=GET%2FPOST — buyer order detail and logistics status.
- https://open.aliexpress.com/handler/share/apidoc/getApi.json?cid=21038&path=aliexpress.ds.order.tracking.get&methodType=GET%2FPOST — order tracking nodes, carrier, timestamps, and SKU/item linkage.

## Review note

This is a feasibility/evidence-gap artifact, not provider approval, legal clearance, or production authorization. Ryan remains the accountable coordinator; provider ownership/grants and specialist compliance sign-off remain external Human Review items.
