import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const evidencePath = new URL("./blocker-receipt.json", import.meta.url);
const evidenceDirectory = new URL("./", import.meta.url);
const contractPath = new URL(
  "../../../test/fixtures/providers/rjc-300/evidence-contract.json",
  import.meta.url
);

test("records the Stripe authority blocker without provider receipts", async () => {
  const evidenceText = await readFile(evidencePath, "utf8");
  const evidence = JSON.parse(evidenceText);
  const contract = JSON.parse(await readFile(contractPath, "utf8"));

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.issue, "RJC-300");
  assert.equal(evidence.status, contract.blockedReceiptRequirements.status);
  assert.equal(
    evidence.checkoutEnabled,
    contract.blockedReceiptRequirements.checkoutEnabled
  );
  assert.equal(
    evidence.sandboxMutationsPerformed,
    contract.blockedReceiptRequirements.sandboxMutationsPerformed
  );
  assert.equal(
    evidence.secretValuesCaptured,
    contract.blockedReceiptRequirements.secretValuesCaptured
  );
  assert.deepEqual(Object.keys(evidence.acceptance), contract.requiredAcceptanceKeys);
  assert.deepEqual(evidence.acceptance, contract.blockedAcceptance);

  for (const receiptIdentifier of Object.values(evidence.receiptIdentifiers)) {
    assert.equal(receiptIdentifier, null);
  }

  assert.deepEqual(evidence.decision, {
    linearAcceptance: "partially_evidenced",
    g0StripeLane: "blocked_external",
    safeFallback: "checkout_disabled",
  });
});

test("contains no Stripe secret-shaped values in the evidence directory", async () => {
  const forbiddenSecretShapes = [
    /[spr]k_(?:test|live)_[A-Za-z0-9]+/u,
    /whsec_[A-Za-z0-9]+/u,
    /acct_[A-Za-z0-9]+/u,
  ];

  const entries = await readdir(evidenceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const evidenceText = await readFile(new URL(entry.name, evidenceDirectory), "utf8");
    for (const forbiddenSecretShape of forbiddenSecretShapes) {
      assert.equal(forbiddenSecretShape.test(evidenceText), false, entry.name);
    }
  }
});
