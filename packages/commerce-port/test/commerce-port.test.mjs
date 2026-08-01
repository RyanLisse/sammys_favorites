import assert from "node:assert/strict";
import test from "node:test";

import { commerceWorkflowCommandSchema } from "../dist/index.js";

test("accepts only known discriminated workflow commands", () => {
  const common = {
    commandId: "1454fd9c-b64b-45a5-a719-d562ccb73c4f",
    requestedAt: "2026-08-01T12:00:00Z",
    requestedBy: "operator-1",
  };
  assert.equal(
    commerceWorkflowCommandSchema.safeParse({
      ...common,
      price: { amountMinor: 2500, currency: "EUR" },
      productId: "product-1",
      type: "catalog.set-price",
    }).success,
    true
  );
  assert.equal(
    commerceWorkflowCommandSchema.safeParse({
      ...common,
      sql: "DELETE FROM products",
      type: "sql.execute",
    }).success,
    false
  );
});
