import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const EVIDENCE_ROOT = "docs/evidence/rjc-304";
const FIXTURE_ROOT = "test/fixtures/providers/rjc-304";
const OBSERVATION_PATH = `${EVIDENCE_ROOT}/telegram-getme-2026-08-30.json`;
const FIXTURE_PATH = `${FIXTURE_ROOT}/telegram-getme-observation.json`;
const GATE_REPORT_PATH = "docs/feasibility/p0-gate-report.json";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("records hashed getMe identity and webhook-absent observation without credentials", async () => {
  const observation = await readJson(OBSERVATION_PATH);
  const fixture = await readJson(FIXTURE_PATH);

  assert.deepEqual(fixture, observation);
  assert.equal(observation.issue, "RJC-304");
  assert.equal(observation.evidenceClass, "provider_observed");
  assert.equal(observation.retrievedAt, "2026-08-30");
  assert.equal(observation.method, "Telegram Bot API getMe + getWebhookInfo");
  assert.equal(observation.credentialMaterialPresent, false);
  assert.equal(observation.productionTraffic, false);
  assert.equal(observation.automatedMessagingEnabled, false);
  assert.equal(observation.getMe.ok, true);
  assert.equal(observation.getMe.is_bot, true);
  assert.equal(observation.getMe.username, "Sammysfavorites_bot");
  assert.equal(observation.getMe.first_name, "Daisy4sammy");
  assert.match(observation.getMe.bot_id_sha256, HASH_PATTERN);
  assert.equal(observation.getWebhookInfo.webhook_configured, false);
  assert.equal(observation.getWebhookInfo.pending_update_count, 0);
  assert.equal(observation.g0Status, "blocked_external");
  assert.ok(observation.remainingReceipts.length >= 5);
});

test("gate report keeps telegram blocked_external and messaging disabled", async () => {
  const report = await readJson(GATE_REPORT_PATH);

  assert.equal(report.gates.G0.status, "blocked_external");
  assert.equal(report.providers.telegram.status, "blocked_external");
  assert.equal(report.deliveryPolicy.automatedMessagingEnabled, false);
  assert.equal(report.deliveryPolicy.p1AndP2MayStart, false);

  const providerObserved = report.providers.telegram.sourceObservations.find(
    (entry) =>
      entry.retrievedAt === "2026-08-30" &&
      entry.evidenceClass === "provider_observed"
  );
  assert.ok(providerObserved);
  assert.match(providerObserved.finding, /Sammysfavorites_bot/u);
  assert.match(
    providerObserved.finding,
    /sha256:f3ba8c6512ad33f7f7fde99d2a1d8f4ada68e75f99f6b923e0b68f3dfd9f0caf/u
  );
  assert.match(providerObserved.finding, /webhook_configured:false/u);
  assert.match(providerObserved.finding, /does not clear G0/u);
});

test("evidence paths contain no bot token, secret, or raw numeric bot id", async () => {
  const paths = [
    OBSERVATION_PATH,
    FIXTURE_PATH,
    `${EVIDENCE_ROOT}/README.md`,
  ];
  const forbiddenPatterns = [
    /\d{8,}:[A-Za-z0-9_-]{20,}/u,
    /"(?:botToken|bot_token|secret_token|TELEGRAM_BOT_TOKEN)"\s*:/iu,
    /"id"\s*:\s*\d+/u,
    /bot_id"\s*:\s*\d+/u,
  ];

  for (const path of paths) {
    const content = await readFile(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `${path} contains ${pattern}`);
    }
    if (path.endsWith(".json")) {
      const hashHex =
        "f3ba8c6512ad33f7f7fde99d2a1d8f4ada68e75f99f6b923e0b68f3dfd9f0caf";
      assert.match(content, new RegExp(`sha256:${hashHex}`, "u"));
      assert.equal(content.split(hashHex).length - 1, 1, path);
    }
  }

  const evidenceFiles = (await readdir(EVIDENCE_ROOT)).filter((name) =>
    name.endsWith(".json")
  );
  assert.ok(evidenceFiles.includes("telegram-getme-2026-08-30.json"));
});
