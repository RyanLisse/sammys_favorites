import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

/* oxlint-disable eslint/require-unicode-regexp -- All test patterns intentionally match ASCII config output. */

const execFileAsync = promisify(execFile);
const workspacePath = process.cwd();
const stackEnvironment = {
  ...process.env,
  CONDUCTOR_PORT: "57100",
  CONDUCTOR_WORKSPACE_NAME: "Test Helsinki",
  CONDUCTOR_WORKSPACE_PATH: workspacePath,
};

const readEnvironment = async (
  environment = stackEnvironment,
  runId = "run-42"
) => {
  const { stdout } = await execFileAsync(
    "bash",
    ["scripts/local-stack.sh", "env", runId],
    {
      env: environment,
    }
  );
  return Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
};

test("local stack emits explicit isolated resources and ports", async () => {
  const environment = await readEnvironment();

  assert.match(
    environment.SAMMYS_COMPOSE_PROJECT,
    /^sammys-test-helsinki-[a-f0-9]{12}$/
  );
  assert.match(
    environment.SAMMYS_TEST_NAMESPACE,
    /^test-helsinki-run-42-[a-f0-9]{8}$/
  );
  assert.equal(
    environment.SAMMYS_POSTGRES_SCHEMA,
    environment.SAMMYS_TEST_NAMESPACE.replaceAll("-", "_")
  );
  assert.equal(
    environment.SAMMYS_REDIS_KEY_PREFIX,
    `${environment.SAMMYS_TEST_NAMESPACE}:`
  );
  assert.equal(
    environment.SAMMYS_QUEUE_PREFIX,
    `${environment.SAMMYS_TEST_NAMESPACE}:queue:`
  );
  assert.match(
    environment.SAMMYS_REDIS_DB,
    /^(?:[1-9]|[1-9][0-9]{1,2}|10[01][0-9]|102[0-3])$/
  );
  assert.match(environment.DATABASE_URL, /127\.0\.0\.1:57100/);
  assert.match(
    environment.DATABASE_URL,
    /options=-csearch_path%3Dtest_helsinki_run_42_[a-f0-9]{8}$/
  );
  assert.match(
    environment.REDIS_URL,
    new RegExp(
      `^redis:\\/\\/:.+@127\\.0\\.0\\.1:57101/${environment.SAMMYS_REDIS_DB}$`
    )
  );
  assert.equal(environment.S3_ENDPOINT, "http://127.0.0.1:57102");
  assert.equal(environment.S3_BUCKET, environment.SAMMYS_TEST_NAMESPACE);
  assert.ok(environment.JWT_SECRET.length >= 64);
  assert.ok(environment.COOKIE_SECRET.length >= 64);
});

test("path and port discriminator prevents same-name workspace collisions", async () => {
  const base = await readEnvironment(stackEnvironment, "same-run");
  const differentPort = await readEnvironment(
    { ...stackEnvironment, CONDUCTOR_PORT: "57110" },
    "same-run"
  );
  const differentPath = await readEnvironment(
    { ...stackEnvironment, CONDUCTOR_WORKSPACE_PATH: `${workspacePath}-other` },
    "same-run"
  );

  assert.notEqual(
    base.SAMMYS_COMPOSE_PROJECT,
    differentPort.SAMMYS_COMPOSE_PROJECT
  );
  assert.notEqual(
    base.SAMMYS_COMPOSE_PROJECT,
    differentPath.SAMMYS_COMPOSE_PROJECT
  );
});

test("different run namespaces reserve different Redis logical databases", async () => {
  const first = await readEnvironment(stackEnvironment, "redis-a");
  const second = await readEnvironment(stackEnvironment, "redis-b");

  assert.notEqual(first.SAMMYS_REDIS_DB, second.SAMMYS_REDIS_DB);
  assert.notEqual(first.REDIS_URL, second.REDIS_URL);
});

test("generated credentials are stable, private, and outside tracked config", async () => {
  const first = await readEnvironment();
  const second = await readEnvironment();
  assert.equal(first.DATABASE_URL, second.DATABASE_URL);
  assert.equal(first.REDIS_URL, second.REDIS_URL);

  const discriminator =
    first.SAMMYS_COMPOSE_PROJECT.match(/[a-f0-9]{12}$/)?.[0];
  assert.ok(discriminator);
  const secretPath = `.context/local-stack/${discriminator}.env`;
  const secretStat = await stat(secretPath);
  assert.equal(secretStat.mode % 0o100, 0);
  const secretText = await readFile(secretPath, "utf-8");
  assert.doesNotMatch(secretText, /local-only|password=sammys/i);
});

test("Compose images are immutable and platform digests are recorded", async () => {
  const compose = await readFile("infra/local/compose.yaml", "utf-8");
  const digestRecord = JSON.parse(
    await readFile("infra/local/image-digests.json", "utf-8")
  );
  const images = [
    ...compose.matchAll(/^\s+image:\s+(?<image>.+@sha256:[a-f0-9]{64})$/gm),
  ].map((match) => match.groups?.image);

  assert.equal(images.length, 4);
  for (const image of digestRecord.images) {
    assert.ok(images.includes(`${image.reference}@${image.indexDigest}`));
    assert.match(image.linuxAmd64Digest, /^sha256:[a-f0-9]{64}$/);
    assert.match(image.linuxArm64Digest, /^sha256:[a-f0-9]{64}$/);
    assert.match(image.sourceUrl, /^https:\/\//);
  }
});

test("down preserves volumes while destroy is explicit", async () => {
  const script = await readFile("scripts/local-stack.sh", "utf-8");
  const downBranch =
    script.match(/\n {2}down\)(?<branch>[\s\S]*?)\n {4};;/)?.groups?.branch ??
    "";
  const destroyBranch =
    script.match(/\n {2}destroy\)(?<branch>[\s\S]*?)\n {4};;/)?.groups
      ?.branch ?? "";
  assert.doesNotMatch(downBranch, /--volumes|-v\b/);
  assert.match(destroyBranch, /--volumes/);
  assert.match(script, /backup-roundtrip/);
  assert.match(script, /backup-survival/);
  assert.match(script, /redis-namespace-snapshot\.mjs backup/);
  assert.match(script, /redis-namespace-snapshot\.mjs restore/);
});

test("Medusa rejects a Redis URL outside its reserved logical database", async () => {
  const config = await readFile("apps/commerce/medusa-config.ts", "utf-8");
  assert.match(config, /redisUrl: isolatedRedisUrl\(\)/);
  assert.match(config, /requiredEnvironmentVariable\("SAMMYS_REDIS_DB"\)/);
  assert.match(config, /REDIS_URL must select the logical database reserved/);
});
