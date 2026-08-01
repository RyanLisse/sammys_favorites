import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const report = JSON.parse(
  await readFile("docs/feasibility/p0-gate-report.json", "utf8")
);

test("external proof gaps keep G0, Human Review, and launch effects closed", () => {
  assert.equal(report.issueStatus, "human_review");
  assert.equal(report.gates.G0.status, "blocked_external");
  assert.equal(report.deliveryPolicy.p1AndP2MayStart, false);
  assert.equal(report.deliveryPolicy.livePaymentsEnabled, false);
  assert.equal(report.deliveryPolicy.automatedWhatsAppEnabled, false);
  assert.equal(report.deliveryPolicy.supplierWritesEnabled, false);
});

test("every provider has dated official-source prerequisites, permissions, and findings", () => {
  for (const provider of Object.values(report.providers)) {
    assert.ok(provider.fallback.length > 20);
    assert.ok(provider.requiredEvidence.length > 0);
    assert.ok(provider.sourceObservations.length > 0);
    for (const observation of provider.sourceObservations) {
      const source = new URL(observation.url);
      assert.equal(source.protocol, "https:");
      assert.ok(
        [
          "docs.stripe.com",
          "developers.facebook.com",
          "chat-sdk.dev",
          "open.aliexpress.com",
        ].includes(source.hostname)
      );
      assert.equal(observation.retrievedAt, report.asOf);
      assert.ok(observation.prerequisites.length > 0);
      assert.ok(observation.scopesOrPermissions.length > 0);
      assert.ok(observation.finding.length > 80);
    }
  }
});

test("coordination ownership is not confused with specialist approval", () => {
  assert.equal(report.compliance.accountableCoordinator, "Ryan Lisse");
  assert.equal(report.compliance.specialistSignoff, "pending");
  assert.equal(report.compliance.notLegalAdvice, true);
  assert.ok(report.compliance.topics.length >= 6);
});
