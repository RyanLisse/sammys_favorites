import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUsableSecretToken,
  createTelegramWebhookReceiver,
  TELEGRAM_PIN,
} from "./telegram-webhook-verifier.mjs";

const SECRET = "PZ8n-Kq2Vt6XrLc0Ay4Jm1Wd7Bs3Ng5H";
const BINDING_SHA256 =
  "sha256:3f1a0c8b5d2e47a9b6c1f80d34e5a27b9c0d6e1f82a3b4c5d6e7f8091a2b3c4d";

const receiver = (overrides = {}) =>
  createTelegramWebhookReceiver({
    allowedUpdates: ["message"],
    environment: "fixture",
    secretToken: SECRET,
    ...overrides,
  });

const inbound = (updateId, type = "message") => ({
  bindingSha256: BINDING_SHA256,
  headers: { "x-telegram-bot-api-secret-token": SECRET },
  receivedAt: "2026-08-03T10:00:00.000Z",
  update: {
    [type]: { text: "fixture: request draft order summary" },
    update_id: updateId,
  },
});

test("pins the Telegram adapter candidate and keeps production traffic disabled", () => {
  assert.equal(TELEGRAM_PIN.adapter, "@chat-adapter/telegram@4.36.0");
  assert.equal(TELEGRAM_PIN.core, "chat@4.36.0");
  assert.equal(TELEGRAM_PIN.productionTraffic, false);
  assert.throws(
    () => receiver({ environment: "production" }),
    /production traffic is disabled/u
  );
});

test("refuses a secret token weak enough to undermine the only authenticity check", () => {
  assert.throws(() => assertUsableSecretToken(""), /1-256 characters/u);
  assert.throws(
    () => assertUsableSecretToken("has spaces and $"),
    /1-256 characters/u
  );
  assert.throws(() => assertUsableSecretToken("short-secret"), /at least 32/u);
  assert.equal(assertUsableSecretToken(SECRET), SECRET);
});

test("refuses an empty allowed_updates list, which would subscribe to everything", () => {
  assert.throws(
    () => receiver({ allowedUpdates: [] }),
    /empty list means every type/u
  );
});

test("accepts an update carrying the registered secret header", () => {
  const result = receiver().receive(inbound(1001));

  assert.equal(result.outcome, "accepted");
  assert.equal(result.receipt.provider, "telegram");
  assert.equal(result.receipt.bindingSha256, BINDING_SHA256);
  assert.equal(result.receipt.receiptId, "telegram-update-1001");
  assert.equal(result.receipt.verifiedAt, "2026-08-03T10:00:00.000Z");
  assert.equal(result.receipt.expiresAt, "2026-08-03T10:05:00.000Z");
});

test("rejects a wrong, absent, or truncated secret header", () => {
  const cases = [
    { "x-telegram-bot-api-secret-token": `${SECRET}x` },
    { "x-telegram-bot-api-secret-token": SECRET.slice(0, -1) },
    { "x-telegram-bot-api-secret-token": "" },
    {},
  ];

  for (const headers of cases) {
    const result = receiver().receive({ ...inbound(1002), headers });
    assert.equal(result.outcome, "rejected");
    assert.equal(result.reason, "secret-token-mismatch");
  }
});

test("rejects an update type the webhook is not subscribed to", () => {
  const result = receiver().receive(inbound(1003, "edited_channel_post"));

  assert.equal(result.outcome, "rejected");
  assert.equal(result.reason, "update-type-not-subscribed");
});

test("fails closed when an update carries more or fewer than one optional field", () => {
  // Telegram guarantees at most one optional field per update. Interpreting a
  // payload that breaks that guarantee would let a subscribed type shadow an
  // unsubscribed one sitting beside it.
  const shapes = [
    { callback_query: {}, message: {}, update_id: 2001 },
    { message: {}, my_chat_member: {}, update_id: 2002 },
    { update_id: 2003 },
  ];

  for (const update of shapes) {
    const result = receiver().receive({ ...inbound(0), update });
    assert.equal(result.outcome, "rejected");
    assert.equal(result.reason, "update-shape-invalid");
    assert.equal(result.receipt, undefined);
  }
});

test("processes a repeated update_id exactly once", () => {
  const instance = receiver();

  assert.equal(instance.receive(inbound(1004)).outcome, "accepted");
  const redelivery = instance.receive(inbound(1004));

  assert.equal(redelivery.outcome, "duplicate");
  assert.equal(redelivery.reason, "update-id-already-processed");
  assert.equal(redelivery.receipt, undefined);
  assert.equal(instance.acceptedCount(), 1);
});

test("mints no receipt for any rejected or duplicate outcome", () => {
  const instance = receiver();
  instance.receive(inbound(1005));

  const outcomes = [
    instance.receive(inbound(1005)),
    instance.receive({ ...inbound(1006), headers: {} }),
    instance.receive(inbound(1007, "callback_query")),
    instance.receive({
      ...inbound(0),
      update: { message: {}, update_id: "1008" },
    }),
  ];

  for (const outcome of outcomes) {
    assert.notEqual(outcome.outcome, "accepted");
    assert.equal(outcome.receipt, undefined);
  }
  assert.equal(instance.acceptedCount(), 1);
});
