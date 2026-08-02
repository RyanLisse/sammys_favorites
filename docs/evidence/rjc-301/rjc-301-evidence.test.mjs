import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const EVIDENCE_ROOT = "docs/evidence/rjc-301";
const FIXTURE_ROOT = "test/fixtures/providers/rjc-301";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("Meta acceptance remains fail-closed without external authority", async () => {
  const matrix = await readJson(`${EVIDENCE_ROOT}/acceptance-matrix.json`);

  assert.equal(matrix.issue, "RJC-301");
  assert.equal(matrix.acceptance, "partial");
  assert.equal(matrix.automatedWhatsAppEnabled, false);
  assert.equal(matrix.fallback, "atelier_manual_communication");
  assert.ok(matrix.criteria.length >= 9);
  assert.ok(
    matrix.criteria.every(({ status }) =>
      ["blocked_external", "documented_not_observed"].includes(status)
    )
  );
});

test("required provider artifacts are blocker records or synthetic contracts, never claimed observations", async () => {
  const fixtureNames = await readdir(FIXTURE_ROOT);

  assert.deepEqual(fixtureNames.sort(), [
    "approved-template.blocker.json",
    "asset-ownership.blocker.json",
    "consent-service-window.constraints.json",
    "observed-scopes.blocker.json",
    "signed-delivery.blocker.json",
  ]);

  for (const fixtureName of fixtureNames) {
    const fixture = await readJson(`${FIXTURE_ROOT}/${fixtureName}`);
    assert.equal(fixture.issue, "RJC-301");
    assert.notEqual(fixture.evidenceClass, "provider_observed");
    assert.ok(
      ["external_blocker", "public_documentation"].includes(
        fixture.evidenceClass
      )
    );
  }
});

test("blocker records identify exact missing receipts using hashes only", async () => {
  const blockerNames = [
    "approved-template.blocker.json",
    "asset-ownership.blocker.json",
    "observed-scopes.blocker.json",
    "signed-delivery.blocker.json",
  ];

  for (const fixtureName of blockerNames) {
    const fixture = await readJson(`${FIXTURE_ROOT}/${fixtureName}`);
    assert.equal(fixture.status, "missing_external_authority");
    assert.equal(fixture.observedAt, null);
    assert.equal(fixture.providerReceipt, null);
    assert.ok(fixture.requiredReceiptFields.length > 0);
    assert.ok(fixture.blocker.length > 80);
    for (const expectedHash of fixture.expectedHashedIdentifiers) {
      assert.match(expectedHash, HASH_PATTERN);
    }
  }
});

test("policy constraints distinguish official documentation from project evidence", async () => {
  const fixture = await readJson(
    `${FIXTURE_ROOT}/consent-service-window.constraints.json`
  );

  assert.equal(fixture.status, "documented_not_observed");
  assert.equal(fixture.customerServiceWindowHours, 24);
  assert.equal(fixture.outsideWindowRequiresApprovedTemplate, true);
  assert.equal(fixture.projectConsentReceipt, null);
  assert.equal(fixture.projectOptOutReceipt, null);
  assert.ok(fixture.sources.length >= 3);
  for (const source of fixture.sources) {
    assert.equal(new URL(source.url).hostname, "developers.facebook.com");
    assert.equal(source.httpStatusObserved, 200);
  }
});

test("evidence files contain no raw Meta identifiers, phone numbers, tokens, or secrets", async () => {
  const fixtureNames = await readdir(FIXTURE_ROOT);
  const evidenceNames = (await readdir(EVIDENCE_ROOT)).filter(
    (name) => name.endsWith(".json") || name.endsWith(".md")
  );
  const paths = [
    ...fixtureNames.map((name) => `${FIXTURE_ROOT}/${name}`),
    ...evidenceNames.map((name) => `${EVIDENCE_ROOT}/${name}`),
  ];
  const forbiddenPatterns = [
    /EAA[A-Za-z0-9]{20,}/u,
    /\+\d{8,15}/u,
    /"(?:appSecret|accessToken|verifyToken|phoneNumberId|wabaId|businessId)"\s*:/iu,
  ];

  for (const path of paths) {
    const content = await readFile(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `${path} contains ${pattern}`);
    }
  }
});
