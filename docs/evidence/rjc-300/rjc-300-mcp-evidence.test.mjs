import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const receiptPath = new URL("./mcp-preflight-receipt.json", import.meta.url);
const evidenceDirectory = new URL("./", import.meta.url);

test("records an authenticated account observation without claiming sandbox or provider-flow evidence", async () => {
  const receiptText = await readFile(receiptPath, "utf8");
  const receipt = JSON.parse(receiptText);

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.issue, "RJC-300");
  assert.equal(receipt.status, "blocked_external");
  assert.equal(receipt.checkoutEnabled, false);
  assert.equal(receipt.providerActivationPerformed, false);
  assert.equal(receipt.sandboxMutationsPerformed, false);
  assert.equal(receipt.secretValuesCaptured, false);
  assert.equal(receipt.authenticatedContext.accountInfoReadSucceeded, true);
  assert.match(receipt.authenticatedContext.stripeAccountIdSha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.providerInventory.paymentIntentCount, 0);
  assert.equal(receipt.providerInventory.webhookEndpointCount, 0);
  assert.equal(
    receipt.authenticatedContext.displayNameIsAuthoritativeSandboxSignal,
    false
  );
  assert.equal(receipt.authenticatedContext.authoritativeSandboxMode, "not_evidenced");
  assert.equal(receipt.authenticatedContext.providerResponseArtifactCaptured, false);
  assert.deepEqual(receipt.acceptance, {
    authenticatedAccountAccess: "observed_not_immutable",
    authenticatedSandboxAccountAccess: "not_evidenced",
    sandboxOwnerIdentity: "not_evidenced",
    dashboardTestModeIndicator: "not_evidenced",
    paymentIntentTestPath: "not_evidenced",
    realSignedWebhookVerification: "not_evidenced",
    duplicateDeliveryIdempotencyAndAudit: "not_evidenced",
    accountableSecondReviewer: "not_evidenced",
    rjc261ImmutableEvidenceLink: "not_evidenced",
    secretHygiene: "evidenced_for_this_capture",
  });
  assert.equal(receipt.capabilityProbe.paymentIntentWriteAttempted, false);
  assert.equal(receipt.capabilityProbe.webhookEndpointWriteAttempted, false);
  assert.equal(receipt.sandboxMutationsPerformed, false);
  assert.equal(receipt.providerActivationPerformed, false);
  assert.deepEqual(receipt.decision, {
    linearAcceptance: "partially_evidenced",
    g0StripeLane: "blocked_external",
    safeFallback: "checkout_disabled",
  });
});

test("contains no Stripe credential or raw account identifier in the evidence directory", async () => {
  const forbiddenShapes = [
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
    for (const forbiddenShape of forbiddenShapes) {
      assert.equal(forbiddenShape.test(evidenceText), false, entry.name);
    }
  }
});
