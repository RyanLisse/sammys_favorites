import assert from "node:assert/strict";
import test from "node:test";

import {
  createApprovalFixture,
  createProposalFixture,
  invalidSupplierSkuSnapshotFixtures,
  validSupplierSkuSnapshotFixture,
} from "../dist/index.js";

test("exports reusable valid and invalid fixtures", () => {
  assert.equal(validSupplierSkuSnapshotFixture.sku, "GOLD-42");
  assert.equal(invalidSupplierSkuSnapshotFixtures.length, 4);
  const proposal = createProposalFixture(
    {
      actionType: "supplier.place-order",
      capability: "supplier.order.execute",
      payload: { sku: "GOLD-42" },
      resource: {
        id: "GOLD-42",
        target: "supplier-1",
        type: "supplier-sku",
      },
      riskClass: "high",
      stage: "execute",
    },
    "a".repeat(64)
  );
  assert.equal(createApprovalFixture(proposal).proposalId, proposal.id);
});
