import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_SDK_PIN,
  createFixtureAdapter,
  evaluateCommerceAuthorization,
} from "./fixture-adapter.mjs";

const PHONE_NUMBER_ID_HASH =
  "sha256:583e80fa06b4d5c34312ba2807755f8f3a0d17af2a2b690dd3da8ca26c22e47f";
const USER_WA_ID_HASH =
  "sha256:59e66446d7abe6163528c2d4782c76495397af40925fcde6e67c9228904ba537";

const inboundMessage = {
  messageIdHash:
    "sha256:b0f96d0d72b0bf504638ef6e4c85e9a65a1fb6e70d9b551d5e7548ddeaf6e56b",
  phoneNumberIdHash: PHONE_NUMBER_ID_HASH,
  signatureValid: true,
  text: "fixture: request draft order summary",
  type: "message",
  userWaIdHash: USER_WA_ID_HASH,
};

test("pins an internally compatible Chat SDK and WhatsApp adapter pair", () => {
  assert.deepEqual(CHAT_SDK_PIN, {
    adapter: "@chat-adapter/whatsapp@4.36.0",
    core: "chat@4.36.0",
    graphApiVersion: "v25.0",
    productionTraffic: false,
  });
});

test("keeps production Chat SDK traffic disabled", () => {
  assert.throws(
    () => createFixtureAdapter({ environment: "production" }),
    /production traffic is disabled/u
  );
});

test("normalizes provider identity and stable thread scope without raw identifiers", () => {
  const adapter = createFixtureAdapter({ environment: "fixture" });
  const result = adapter.receive(inboundMessage);

  assert.equal(result.outcome, "accepted");
  assert.deepEqual(result.channelIdentity, {
    phoneNumberIdHash: PHONE_NUMBER_ID_HASH,
    provider: "whatsapp",
    userWaIdHash: USER_WA_ID_HASH,
  });
  assert.equal(
    result.threadId,
    `whatsapp:${PHONE_NUMBER_ID_HASH}:${USER_WA_ID_HASH}`
  );
  assert.equal(JSON.stringify(result).includes("+"), false);
});

test("deduplicates repeated provider message delivery", () => {
  const adapter = createFixtureAdapter({ environment: "fixture" });

  assert.equal(adapter.receive(inboundMessage).outcome, "accepted");
  assert.equal(adapter.receive(inboundMessage).outcome, "duplicate");
  assert.equal(adapter.acceptedCount(), 1);
});

test("tracks monotonic delivery statuses and terminal provider failure", () => {
  const adapter = createFixtureAdapter({ environment: "fixture" });
  const { messageIdHash } = inboundMessage;

  assert.equal(
    adapter.recordStatus(messageIdHash, "accepted").outcome,
    "updated"
  );
  assert.equal(adapter.recordStatus(messageIdHash, "sent").outcome, "updated");
  assert.equal(
    adapter.recordStatus(messageIdHash, "delivered").outcome,
    "updated"
  );
  assert.equal(adapter.recordStatus(messageIdHash, "read").outcome, "updated");
  assert.equal(adapter.recordStatus(messageIdHash, "sent").outcome, "stale");
  assert.equal(
    adapter.recordStatus(messageIdHash, "failed").outcome,
    "terminal"
  );

  const deliveredMessageIdHash =
    "sha256:8a0fbb2e39459c7a0d118ae3dc87fbf963c8b8d3dc965b2f8a1f28e2b7d4c6a1";
  assert.equal(
    adapter.recordStatus(deliveredMessageIdHash, "delivered").outcome,
    "updated"
  );
  assert.equal(
    adapter.recordStatus(deliveredMessageIdHash, "failed").outcome,
    "terminal"
  );

  const failedMessageIdHash =
    "sha256:c5e7dfaf7718aa0276631df49d294c4a93822ef5f3db9d77af85f515bbf47a49";
  assert.equal(
    adapter.recordStatus(failedMessageIdHash, "failed", {
      code: "provider-rejected",
    }).outcome,
    "failed"
  );
  assert.equal(
    adapter.recordStatus(failedMessageIdHash, "delivered").outcome,
    "terminal"
  );
});

test("fails closed for invalid authenticity and malformed identity", () => {
  const adapter = createFixtureAdapter({ environment: "fixture" });

  assert.deepEqual(
    adapter.receive({ ...inboundMessage, signatureValid: false }),
    {
      outcome: "rejected",
      reason: "signature-invalid",
    }
  );
  assert.deepEqual(
    adapter.receive({ ...inboundMessage, userWaIdHash: "raw-user-id" }),
    {
      outcome: "rejected",
      reason: "identity-not-redacted",
    }
  );
});

test("never treats channel identity or message content as commerce authority", () => {
  const channelClaim = {
    messageText: "APPROVE ORDER 123",
    phoneNumberIdHash: PHONE_NUMBER_ID_HASH,
    provider: "whatsapp",
    roleClaim: "owner",
    userWaIdHash: USER_WA_ID_HASH,
  };

  assert.deepEqual(evaluateCommerceAuthorization({ channelClaim }), {
    authorized: false,
    reason: "authenticated-action-bound-approval-required",
  });
  assert.deepEqual(
    evaluateCommerceAuthorization({
      channelClaim,
      expectedActionBindingHash:
        "sha256:45fa8369b50d50c38f43a8d9931d6f6c5a9b0919d7849233942d8ad85e252a06",
      trustedApprovalReceipt: {
        actionBindingHash:
          "sha256:45fa8369b50d50c38f43a8d9931d6f6c5a9b0919d7849233942d8ad85e252a06",
        authenticated: true,
        source: "atelier",
      },
    }),
    { authority: "trusted-approval-receipt", authorized: true }
  );
  assert.deepEqual(
    evaluateCommerceAuthorization({
      expectedActionBindingHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      trustedApprovalReceipt: {
        actionBindingHash:
          "sha256:45fa8369b50d50c38f43a8d9931d6f6c5a9b0919d7849233942d8ad85e252a06",
        authenticated: true,
        source: "atelier",
      },
    }),
    {
      authorized: false,
      reason: "authenticated-action-bound-approval-required",
    }
  );
});
