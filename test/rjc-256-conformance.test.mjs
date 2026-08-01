import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  packageManifests,
  readJson,
  repositoryFiles,
  rootDirectory,
  scanProductionProvenance,
} from "../scripts/rjc-256/conformance.mjs";

const evidence = "docs/evidence/rjc-256";

test("the authoritative decision is clean-room and does not require direct-use acceptance", async () => {
  const baseline = await readJson(`${evidence}/baseline.json`);
  assert.equal(baseline.decision, "clean-room");
  assert.equal(baseline.status, "accepted");
  assert.equal(baseline.owner_direct_use_confirmation_required, false);
  assert.equal(baseline.historical_research.normative, false);
  assert.equal(baseline.historical_research.implementation_input, false);
  assert.equal(
    baseline.historical_research.license.root_package_license,
    "UNLICENSED"
  );
  assert.equal(baseline.historical_research.license.upstream_permission, false);
  assert.equal(baseline.historical_research.license.legal_clearance, false);
});

test("the ADR preserves provenance while prohibiting all implementation reuse", async () => {
  const adr = await readFile(
    join(
      rootDirectory,
      "docs/decisions/0001-upstream-baseline-and-direct-use-risk.md"
    ),
    "utf8"
  );
  for (const phrase of [
    "clean-room foundation",
    "must not reuse 306 source code",
    "dependency manifests or lockfiles",
    "generated files",
    "build\\s+output",
    "official pnpm, Turborepo, Next.js, and Medusa",
    "UNLICENSED",
    "supersedes all earlier direct-use proposals",
  ]) {
    assert.match(adr, new RegExp(phrase, "iu"));
  }
});

test("the clean-room target map has no retain or adapt dispositions", async () => {
  const migration = await readJson(`${evidence}/migration-map.json`);
  assert.equal(migration.strategy, "clean-room");
  assert.equal(migration.historical_upstream_is_implementation_input, false);
  assert.ok(migration.targets.length >= 5);
  for (const target of migration.targets) {
    assert.match(target.target, /^@sammys\//u);
    assert.doesNotMatch(target.disposition, /retain|adapt|copy/iu);
  }
});

test("selected versions match the independently scaffolded manifests", async () => {
  const matrix = await readJson(`${evidence}/version-matrix.json`);
  const root = await readJson("package.json");
  const commerce = await readJson("apps/commerce/package.json");
  const storefront = await readJson("apps/storefront/package.json");
  const lockfile = await readFile(join(rootDirectory, "pnpm-lock.yaml"), "utf8");

  assert.equal(matrix.strategy, "clean-room");
  assert.equal(matrix.historical_upstream_versions_are_candidates, false);
  assert.equal(process.version, `v${matrix.selected.node_runtime}`);
  assert.equal(root.engines.node, matrix.selected.node_engine);
  assert.match(
    root.packageManager,
    new RegExp(`^pnpm@${matrix.selected.pnpm.replaceAll(".", "\\.")}`)
  );
  assert.equal(root.devDependencies.turbo, matrix.selected.turbo);
  assert.equal(root.devDependencies.typescript, matrix.selected.typescript);
  assert.equal(storefront.dependencies.next, matrix.selected.next);
  assert.equal(storefront.dependencies.react, matrix.selected.storefront_react);
  assert.equal(
    storefront.dependencies["react-dom"],
    matrix.selected.storefront_react_dom
  );
  assert.equal(commerce.dependencies["@medusajs/medusa"], matrix.selected.medusa);
  assert.equal(
    commerce.dependencies.react,
    matrix.selected.commerce_runtime_react
  );
  assert.equal(
    commerce.dependencies["react-dom"],
    matrix.selected.commerce_runtime_react_dom
  );
  assert.match(lockfile, new RegExp(`^  vite@${matrix.selected.vite_resolved}:`, "mu"));
  assert.match(lockfile, new RegExp(`^  eslint@${matrix.selected.eslint_resolved}:`, "mu"));
  assert.match(
    lockfile,
    new RegExp(`^  emittery@${matrix.selected.emittery_override}:`, "mu")
  );
  assert.deepEqual(
    matrix.security_disposition["audit_at_2026-08-01T10:49:05Z"],
    {
      critical: 0,
      high: 0,
      moderate: 3,
      status:
        "open upstream transitive advisories; acceptable for scaffold verification only and blocks production release until remediated or formally risk-reviewed",
      advisories: [
        "GHSA-wrjc-x8rr-h8h6",
        "GHSA-jjmj-jmhj-qwj2",
        "GHSA-337j-9hxr-rhxg",
      ],
    }
  );
});

test("official-source and scaffold provenance readbacks are complete", async () => {
  const sources = await readJson(`${evidence}/official-source-readback.json`);
  const provenance = await readJson(`${evidence}/scaffold-provenance.json`);
  assert.match(sources.retrieved_at, /^2026-08-01T\d{2}:\d{2}:\d{2}Z$/u);
  assert.equal(sources.records.length, 8);
  for (const record of sources.records) {
    assert.equal(record.http_status, 200);
    assert.ok(record.bytes > 0);
    assert.match(record.sha256, /^[a-f0-9]{64}$/u);
    assert.match(record.url, /^https:\/\//u);
  }
  assert.equal(provenance.strategy, "clean-room");
  assert.match(
    provenance.independent_rebuild_readback.scaffold_commit,
    /^[a-f0-9]{40}$/u
  );
  assert.match(
    provenance.independent_rebuild_readback.changed_path_inventory_sha256,
    /^[a-f0-9]{64}$/u
  );
  assert.match(provenance.superseded_scaffold_commit, /is not relied on/iu);
  assert.match(provenance.limitation, /cannot prove independent creation/iu);
});

test("workspace manifests use Sammy identities and no historical package scope", async () => {
  for (const { path, manifest } of await packageManifests()) {
    if (manifest.name?.startsWith("@")) {
      assert.match(manifest.name, /^@sammys\//u, path);
    }
    assert.doesNotMatch(JSON.stringify(manifest), /@starter\//u, path);
  }
});

test("production-tracked files contain no 306 implementation references", async () => {
  assert.deepEqual(await scanProductionProvenance(), []);
});

test("the active suite and utility are tracked and independent of ignored OMC state", async () => {
  const runs = await readJson(`${evidence}/test-runs.json`);
  const files = new Set(await repositoryFiles());
  assert.equal(runs.active_lineage, "clean-room-v1");
  assert.equal(runs.supersedes, "v1 through v2.11 direct-use conformance lineages");
  for (const path of runs.tracked_implementation) {
    assert.doesNotMatch(path, /^\.omx\//u);
    assert.ok(files.has(path), `${path} must be present in the clean export set`);
    await readFile(join(rootDirectory, path), "utf8");
  }
  assert.ok(
    files.has("docs/evidence/rjc-256/README.md"),
    "evidence classification README must be present in the clean export set"
  );
  const activeTest = await readFile(
    join(rootDirectory, "test/rjc-256-conformance.test.mjs"),
    "utf8"
  );
  assert.doesNotMatch(activeTest, /\.omx\//u);
});
