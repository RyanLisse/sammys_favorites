import assert from "node:assert/strict";
import test from "node:test";

import {
  supplierOrderRequestSchema,
  supplierQuoteRequestSchema,
  supplierSkuRefSchema,
} from "../dist/index.js";

const reference = {
  productId: "supplier-product-1",
  sku: "GOLD-42",
  supplierId: "supplier-1",
  version: "v1",
};

test("runtime schemas accept exact versioned supplier requests", () => {
  assert.equal(supplierSkuRefSchema.safeParse(reference).success, true);
  assert.equal(
    supplierQuoteRequestSchema.safeParse({
      ...reference,
      quantity: 2,
      requestedAt: "2026-08-01T12:00:00Z",
    }).success,
    true
  );
  assert.equal(
    supplierOrderRequestSchema.safeParse({
      approvalNonce: "one-time-nonce-123",
      proposalBindingSha256: "a".repeat(64),
      proposalId: "1454fd9c-b64b-45a5-a719-d562ccb73c4f",
      quantity: 2,
      quoteId: "quote-1",
      sku: "GOLD-42",
      supplierId: "supplier-1",
      version: "v1",
    }).success,
    true
  );
});

test("runtime schemas reject stale versions, unknown fields, and invalid times", () => {
  assert.equal(
    supplierSkuRefSchema.safeParse({ ...reference, version: "v0" }).success,
    false
  );
  assert.equal(
    supplierSkuRefSchema.safeParse({ ...reference, token: "secret" }).success,
    false
  );
  assert.equal(
    supplierQuoteRequestSchema.safeParse({
      ...reference,
      quantity: 1,
      requestedAt: "not-a-time",
    }).success,
    false
  );
});
