import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_VERSION,
  approvalSchema,
  moneySchema,
  proposalSchema,
  supplierQuoteSchema,
  supplierSkuSnapshotSchema,
} from "../dist/index.js";

const binding = {
  actionType: "supplier.place-order",
  capability: "supplier.order.execute",
  payload: { quantity: 1, sku: "GOLD-42" },
  resource: {
    id: "GOLD-42",
    target: "supplier-1",
    type: "supplier-sku",
  },
  riskClass: "high",
  stage: "execute",
};

test("money uses safe minor units and a recognized currency", () => {
  assert.deepEqual(moneySchema.parse({ amountMinor: 1299, currency: "EUR" }), {
    amountMinor: 1299,
    currency: "EUR",
  });
  assert.equal(
    moneySchema.safeParse({ amountMinor: 12.99, currency: "EUR" }).success,
    false
  );
  assert.equal(
    moneySchema.safeParse({ amountMinor: 1299, currency: "ZZZ" }).success,
    false
  );
});

test("supplier snapshots identify an exact SKU and reject stale versions", () => {
  const snapshot = {
    availableQuantity: 3,
    capturedAt: "2026-08-01T12:00:00Z",
    leadTimeDays: 5,
    productId: "supplier-product-1",
    sku: "GOLD-42",
    supplierId: "supplier-1",
    unitPrice: { amountMinor: 1000, currency: "EUR" },
    version: CONTRACT_VERSION,
  };
  assert.equal(supplierSkuSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(
    supplierSkuSnapshotSchema.safeParse({ ...snapshot, version: "v0" }).success,
    false
  );
  assert.equal(
    supplierSkuSnapshotSchema.safeParse({ ...snapshot, ambient: "field" })
      .success,
    false
  );
});

test("quote and approval time invariants fail closed", () => {
  assert.equal(
    supplierQuoteSchema.safeParse({
      expiresAt: "2026-08-01T11:59:00Z",
      quantity: 1,
      quoteId: "quote-1",
      quotedAt: "2026-08-01T12:00:00Z",
      sku: "GOLD-42",
      supplierId: "supplier-1",
      total: { amountMinor: 1000, currency: "EUR" },
      version: "v1",
    }).success,
    false
  );
  assert.equal(
    approvalSchema.safeParse({
      actorId: "ryan",
      approvedAt: "2026-08-01T12:05:00Z",
      binding,
      expiresAt: "2026-08-01T12:00:00Z",
      nonce: "one-time-nonce-123",
      proposalBindingSha256: "a".repeat(64),
      proposalId: "1454fd9c-b64b-45a5-a719-d562ccb73c4f",
      proposalVersion: "v1",
      version: "v1",
    }).success,
    false
  );
});

test("parsed proposals and approvals are deeply immutable", () => {
  const proposal = proposalSchema.parse({
    binding,
    bindingSha256: "a".repeat(64),
    createdAt: "2026-08-01T11:55:00Z",
    createdBy: "agent-1",
    expiresAt: "2026-08-01T12:10:00Z",
    id: "1454fd9c-b64b-45a5-a719-d562ccb73c4f",
    version: "v1",
  });
  const approval = approvalSchema.parse({
    actorId: "ryan",
    approvedAt: "2026-08-01T11:59:00Z",
    binding,
    expiresAt: "2026-08-01T12:05:00Z",
    nonce: "one-time-nonce-123",
    proposalBindingSha256: proposal.bindingSha256,
    proposalId: proposal.id,
    proposalVersion: proposal.version,
    version: "v1",
  });
  assert.equal(Object.isFrozen(proposal), true);
  assert.equal(Object.isFrozen(proposal.binding.payload), true);
  assert.equal(Object.isFrozen(approval.binding.resource), true);
  assert.throws(() => {
    approval.binding.resource.id = "substituted";
  }, TypeError);
});
