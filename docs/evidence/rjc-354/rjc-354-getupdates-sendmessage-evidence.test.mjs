import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const EVIDENCE_ROOT = "docs/evidence/rjc-354";
const FIXTURE_ROOT = "test/fixtures/providers/rjc-354";
const OBSERVATION_NAME = "telegram-getupdates-sendmessage-2026-08-30.json";
const OBSERVATION_PATH = `${EVIDENCE_ROOT}/${OBSERVATION_NAME}`;
const FIXTURE_PATH = `${FIXTURE_ROOT}/telegram-getupdates-sendmessage-observation.json`;
const GATE_REPORT_PATH = "docs/feasibility/p0-gate-report.json";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("records hashed getUpdates and sendMessage receipts without credentials", async () => {
  const observation = await readJson(OBSERVATION_PATH);
  const fixture = await readJson(FIXTURE_PATH);

  assert.deepEqual(fixture, observation);
  assert.equal(observation.issue, "RJC-354");
  assert.equal(observation.evidenceClass, "provider_observed");
  assert.equal(observation.retrievedAt, "2026-08-30");
  assert.equal(observation.timezone, "Europe/Amsterdam");
  assert.equal(observation.method, "Telegram Bot API getUpdates + sendMessage");
  assert.equal(observation.transport, "long_polling");
  assert.equal(observation.phase, "test");
  assert.equal(observation.credentialMaterialPresent, false);
  assert.equal(observation.productionTraffic, false);
  assert.equal(observation.automatedMessagingEnabled, false);
  assert.equal(observation.g0Status, "blocked_external");
  assert.ok(observation.remainingReceipts.length >= 5);
});

test("both inbound updates are hashed, in one private chat, with no raw ids", async () => {
  const observation = await readJson(OBSERVATION_PATH);
  const [first, second] = observation.inboundUpdates;

  assert.equal(observation.inboundUpdates.length, 2);
  for (const update of observation.inboundUpdates) {
    assert.match(update.update_id_sha256, HASH_PATTERN);
    assert.equal(update.chat, "same private chat");
    assert.equal(update.chat_type, "private");
  }

  assert.equal(first.text, "/start");
  assert.equal(first.atLocalApprox, "2026-08-30T22:29:17+02:00");
  assert.equal(
    first.update_id_sha256,
    "sha256:5be311f056fa8d4929118f1cc628f95b9977af53c5722d49fe1f707ef666eca9"
  );

  assert.equal(second.text_len, 3);
  assert.equal(second.atLocalApprox, "2026-08-30T22:29:24+02:00");
  assert.equal(
    second.update_id_sha256,
    "sha256:0eb94617bb8a4e522a85dcdc3b6c00e9121c17b58e29bc888db57fe13ee789d9"
  );

  // The second inbound message body is never recorded, only its length.
  assert.equal(second.text, undefined);
  assert.notEqual(first.update_id_sha256, second.update_id_sha256);
});

test("the outbound sendMessage receipt is hashed and succeeded", async () => {
  const { outboundSendMessage } = await readJson(OBSERVATION_PATH);

  assert.equal(outboundSendMessage.ok, true);
  assert.equal(outboundSendMessage.atLocalApprox, "2026-08-30T22:29:59+02:00");
  assert.equal(outboundSendMessage.chat, "same private chat");
  assert.match(outboundSendMessage.message_id_sha256, HASH_PATTERN);
  assert.equal(
    outboundSendMessage.message_id_sha256,
    "sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce"
  );
});

test("polling receipts do not overclaim webhook authenticity or deduplication", async () => {
  const observation = await readJson(OBSERVATION_PATH);

  assert.equal(observation.webhookUsed, false);
  assert.equal(observation.getWebhookInfo.webhook_configured, false);
  assert.equal(observation.secretTokenEvidenced, false);
  assert.equal(observation.offsetHandling.updatesConsumed, false);
  assert.match(observation.offsetHandling.note, /not duplicate-suppression/u);
  assert.match(observation.finding, /does not clear G0/u);
  assert.match(
    observation.finding,
    /nothing here evidences the X-Telegram-Bot-Api-Secret-Token/u
  );
});

test("gate report keeps telegram blocked_external and messaging disabled", async () => {
  const report = await readJson(GATE_REPORT_PATH);

  assert.equal(report.gates.G0.status, "blocked_external");
  assert.equal(report.providers.telegram.status, "blocked_external");
  assert.equal(report.deliveryPolicy.automatedMessagingEnabled, false);
  assert.equal(report.deliveryPolicy.p1AndP2MayStart, false);
  assert.equal(report.deliveryPolicy.livePaymentsEnabled, false);
  assert.equal(report.deliveryPolicy.supplierWritesEnabled, false);
});

test("evidence paths contain no bot token, secret, or raw numeric identifier", async () => {
  const paths = [OBSERVATION_PATH, FIXTURE_PATH, `${EVIDENCE_ROOT}/README.md`];
  const forbiddenPatterns = [
    /\d{8,}:[A-Za-z0-9_-]{20,}/u,
    /"(?:botToken|bot_token|secret_token|TELEGRAM_BOT_TOKEN)"\s*:/iu,
    /"id"\s*:\s*\d+/u,
    /(?:bot|chat|update|message)_id"\s*:\s*\d+/u,
    /\b(?:chat|update|message)_id\b\s*[:=]\s*-?\d+/iu,
  ];

  const hashes = [
    "5be311f056fa8d4929118f1cc628f95b9977af53c5722d49fe1f707ef666eca9",
    "0eb94617bb8a4e522a85dcdc3b6c00e9121c17b58e29bc888db57fe13ee789d9",
    "4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
  ];

  for (const path of paths) {
    const content = await readFile(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `${path} contains ${pattern}`);
    }
    if (path.endsWith(".json")) {
      for (const hashHex of hashes) {
        assert.match(content, new RegExp(`sha256:${hashHex}`, "u"));
        assert.equal(content.split(hashHex).length - 1, 1, path);
      }
    }
  }

  const evidenceFiles = (await readdir(EVIDENCE_ROOT)).filter((name) =>
    name.endsWith(".json")
  );
  assert.deepEqual(evidenceFiles, [OBSERVATION_NAME]);
});
