import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const report = JSON.parse(
  await readFile("docs/feasibility/p0-gate-report.json", "utf-8")
);

test("external proof gaps keep G0, Human Review, and launch effects closed", () => {
  assert.equal(report.issueStatus, "human_review");
  assert.equal(report.gates.G0.status, "blocked_external");
  assert.equal(report.deliveryPolicy.p1AndP2MayStart, false);
  assert.equal(report.deliveryPolicy.livePaymentsEnabled, false);
  assert.equal(report.deliveryPolicy.automatedMessagingEnabled, false);
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
          "core.telegram.org",
          "registry.npmjs.org",
          "open.aliexpress.com",
        ].includes(source.hostname)
      );
      assert.match(observation.retrievedAt, /^\d{4}-\d{2}-\d{2}$/u);
      assert.ok(observation.retrievedAt <= report.asOf);
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
  assert.equal(report.compliance.allRowsGreen, false);
  assert.equal(report.compliance.nextCriticalReviewDate, "2026-08-10");
  assert.ok(report.compliance.topics.length >= 6);
  assert.equal(report.compliance.timeSensitiveFindings.length, 2);
  assert.match(report.compliance.timeSensitiveFindings[0], /2026-07-01/u);
  assert.match(report.compliance.timeSensitiveFindings[1], /2026-08-12/u);
});

test("a superseded lane keeps its dated observations and names what replaced it", async () => {
  const superseded = Object.entries(report.providers).filter(
    ([, provider]) => provider.status === "superseded_by_decision"
  );
  assert.ok(superseded.length > 0);
  for (const [name, provider] of superseded) {
    assert.ok(
      provider.sourceObservations.length > 0,
      `${name} must retain its observations rather than delete them`
    );
    assert.match(provider.supersededOn, /^\d{4}-\d{2}-\d{2}$/u);
    assert.ok(provider.supersessionReason.length > 80);
    await readFile(provider.supersededBy, "utf-8");
    const replacement = Object.values(report.providers).find(
      (candidate) => candidate.replaces === name
    );
    assert.ok(replacement, `${name} must name the lane that replaced it`);
    assert.equal(replacement.decisionRecord, provider.supersededBy);
  }
});

test("the messaging lane stays fail-closed until its receipts exist", () => {
  const { telegram } = report.providers;
  assert.equal(telegram.status, "blocked_external");
  assert.equal(report.deliveryPolicy.automatedMessagingEnabled, false);
  assert.ok(telegram.requiredEvidence.length >= 6);
  assert.ok(telegram.securityNote.includes("not an HMAC"));
});

test("CI report links the detailed provider and compliance evidence gaps", async () => {
  const [providerMatrix, complianceMatrix, channelDecision] = await Promise.all(
    [
      readFile(report.evidenceArtifacts.providerMatrix, "utf-8"),
      readFile(report.evidenceArtifacts.complianceMatrix, "utf-8"),
      readFile(report.evidenceArtifacts.channelDecision, "utf-8"),
    ]
  );
  assert.match(channelDecision, /Status: Accepted/u);
  assert.match(providerMatrix, /2026-08-03 addendum/u);
  assert.match(complianceMatrix, /2026-08-03 addendum/u);
  assert.match(providerMatrix, /G0.*blocked_external/su);
  assert.match(providerMatrix, /Chat SDK.*Beta/su);
  assert.match(providerMatrix, /aliexpress\.ds\.order\.create/u);
  assert.match(complianceMatrix, /No row below is green/u);
  assert.match(complianceMatrix, /specialist sign-off pending/u);
});
