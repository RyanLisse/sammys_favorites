import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(evidenceDirectory, "../../..");
const fixturePath = join(
  repositoryRoot,
  "test/fixtures/providers/rjc-302/aliexpress-blocked-evidence.json"
);
const manifestPath = join(evidenceDirectory, "official-docs-manifest.json");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("records every AliExpress acceptance area without overstating public docs", async () => {
  const fixture = await readJson(fixturePath);

  assert.equal(fixture.issue, "RJC-302");
  assert.equal(fixture.provider, "AliExpress Open Platform");
  assert.equal(fixture.evidenceMode, "public_official_documentation_only");
  assert.equal(fixture.supplierOrderWritePortEnabled, false);
  assert.equal(fixture.orderPlaced, false);
  assert.equal(fixture.storefrontScraped, false);

  for (const acceptanceArea of [
    "applicationOwnership",
    "grantedScopes",
    "exactSkuSnapshot",
    "freightQuote",
    "authorizedOrderTrackingLifecycle",
    "idempotencyDriftReconciliation",
  ]) {
    assert.equal(fixture.acceptance[acceptanceArea].status, "blocked");
    assert.ok(fixture.acceptance[acceptanceArea].blocker.length > 20);
  }

  assert.equal(fixture.fallback.mode, "manual_supplier_ordering_and_tracking");
  assert.equal(fixture.fallback.automatedSupplierWriteAllowed, false);
  assert.match(fixture.fallback.reconciliation, /manual/u);
});

test("binds all required API documentation observations to SHA-256 digests", async () => {
  const manifest = await readJson(manifestPath);
  const expectedPaths = [
    "aliexpress.ds.product.get",
    "aliexpress.ds.freight.query",
    "aliexpress.ds.order.create",
    "aliexpress.trade.ds.order.get",
    "aliexpress.ds.order.tracking.get",
  ];

  assert.equal(manifest.evidenceClass, "public_documentation_reachability");
  assert.equal(manifest.provesAccountAccess, false);
  assert.match(manifest.captureRedaction, /REDACTED_PUBLIC_SAMPLE/u);
  assert.deepEqual(
    manifest.observations.map(({ apiPath }) => apiPath),
    expectedPaths
  );

  for (const observation of manifest.observations) {
    assert.equal(observation.httpStatus, 200);
    assert.match(observation.responseSha256, /^[a-f0-9]{64}$/u);
    assert.equal(observation.responseStored, true);
    assert.match(observation.url, /^https:\/\/open\.aliexpress\.com\//u);

    const response = await readFile(
      join(evidenceDirectory, observation.responseFile)
    );
    assert.equal(response.byteLength, observation.responseBytes);
    assert.equal(
      createHash("sha256").update(response).digest("hex"),
      observation.responseSha256
    );
    assert.match(response.toString("utf8"), new RegExp(observation.apiPath));
    assert.match(response.toString("utf8"), /REDACTED_PUBLIC_SAMPLE/u);
  }
});

test("contains no credential-shaped evidence", async () => {
  const fixtureDirectory = dirname(fixturePath);
  const evidenceEntries = await readdir(evidenceDirectory, {
    withFileTypes: true,
  });
  const captureEntries = await readdir(join(evidenceDirectory, "captures"), {
    withFileTypes: true,
  });
  const files = [
    ...evidenceEntries
      .filter((entry) => entry.isFile())
      .map((entry) => join(evidenceDirectory, entry.name)),
    ...captureEntries
      .filter((entry) => entry.isFile())
      .map((entry) => join(evidenceDirectory, "captures", entry.name)),
    ...(await readdir(fixtureDirectory)).map((name) =>
      join(fixtureDirectory, name)
    ),
  ];
  const prohibitedPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /["']?(?:access[_-]?token|app[_-]?secret|session[_-]?key)["']?\s*[=:]\s*["']?(?!missing|not[_ -]present|redacted)[A-Za-z0-9_\-.]{12,}/iu,
  ];

  assert.match(
    `{"${"access"}_token":"abcdefghijklmnop"}`,
    prohibitedPatterns[1]
  );

  for (const path of files) {
    const contents = await readFile(path, "utf8");
    for (const pattern of prohibitedPatterns) {
      assert.doesNotMatch(contents, pattern, path);
    }
  }
});
