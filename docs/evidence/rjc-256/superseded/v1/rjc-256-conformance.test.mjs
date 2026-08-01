import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const EVIDENCE = join(ROOT, 'docs/evidence/rjc-256');
const UPSTREAM = 'https://github.com/306-Technologies/306-starter-monorepo';
const PIN = '10b5d4b0623123737854a3cb02d54f6e32a1fb9e';

export const CASE_VECTOR = Object.freeze([
  'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08',
  'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16',
  'C18', 'C19', 'C20', 'C21', 'C23', 'C24', 'C25', 'C26',
]);

// Deliberately excludes test-runs.json and the provenance test: first Green must
// not depend on evidence about its own execution.
const ARTIFACTS = Object.freeze({
  baseline: 'docs/evidence/rjc-256/baseline.json',
  matrix: 'docs/evidence/rjc-256/version-matrix.json',
  migration: 'docs/evidence/rjc-256/migration-map.json',
  security: 'docs/evidence/rjc-256/security-advisories.json',
  spike: 'docs/evidence/rjc-256/spike.json',
  linear: 'docs/evidence/rjc-256/linear-acceptance.json',
  adr: 'docs/decisions/0001-upstream-baseline-and-direct-use-risk.md',
  rootManifest: 'docs/evidence/rjc-256/spike-input/package.json',
  apiManifest: 'docs/evidence/rjc-256/spike-input/apps-api.package.json',
  webManifest: 'docs/evidence/rjc-256/spike-input/apps-web.package.json',
  workspace: 'docs/evidence/rjc-256/spike-input/pnpm-workspace.yaml',
  lockfile: 'docs/evidence/rjc-256/spike-input/pnpm-lock.yaml',
  patch: 'docs/evidence/rjc-256/spike-input/workspace-reduction.patch',
  acquisitionLog: 'docs/evidence/rjc-256/transcripts/acquisition.log',
  offlineLog: 'docs/evidence/rjc-256/transcripts/offline-build.log',
  acquisitionInspect: 'docs/evidence/rjc-256/captures/acquisition-inspect.json',
  offlineInspect: 'docs/evidence/rjc-256/captures/offline-inspect.json',
  acquisitionProcess: 'docs/evidence/rjc-256/captures/acquisition-process.json',
  offlineProcess: 'docs/evidence/rjc-256/captures/offline-process.json',
  sums: 'docs/evidence/rjc-256/SHA256SUMS',
});

const JSON_ARTIFACTS = Object.freeze([
  'baseline', 'matrix', 'migration', 'security', 'spike', 'linear',
  'rootManifest', 'apiManifest', 'webManifest', 'acquisitionInspect',
  'offlineInspect', 'acquisitionProcess', 'offlineProcess',
]);
const pathOf = key => join(ROOT, ARTIFACTS[key]);
const exists = path => access(path).then(() => true, () => false);
const digest = value => createHash('sha256').update(value).digest('hex');

async function readText(key) {
  assert.ok(await exists(pathOf(key)), `missing canonical artifact: ${ARTIFACTS[key]}`);
  return readFile(pathOf(key), 'utf8');
}

async function readJson(key) {
  const source = await readText(key);
  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(`${ARTIFACTS[key]} must parse as JSON: ${error.message}`);
  }
}

function object(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function keys(value, required, label) {
  object(value, label);
  const missing = required.filter(key => !Object.hasOwn(value, key));
  assert.deepEqual(missing, [], `${label} missing required fields: ${missing.join(', ')}`);
}

function timestamp(value, label) {
  assert.match(value ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, `${label} must be a UTC timestamp`);
}

function sourceRecord(value, label) {
  keys(value, ['source', 'retrieved_at'], label);
  assert.ok(String(value.source).length > 0, `${label}.source must be non-empty`);
  timestamp(value.retrieved_at, `${label}.retrieved_at`);
}

function validateBaseline(b) {
  keys(b, ['upstream_url', 'commit', 'commit_verification', 'commit_metadata', 'license', 'owner_decision', 'ownership'], 'baseline');
  assert.equal(b.upstream_url, UPSTREAM, 'canonical upstream URL changed');
  assert.equal(b.commit, PIN, 'pinned commit changed or is abbreviated');
  assert.equal(b.commit_verification, PIN, 'verified checkout must equal the full pin');
  sourceRecord(b.commit_metadata, 'baseline.commit_metadata');
  keys(b.license, ['root_package_license', 'root_license_files', 'github_license_detected', 'source', 'retrieved_at'], 'baseline.license');
  assert.equal(b.license.root_package_license, 'UNLICENSED');
  assert.deepEqual(b.license.root_license_files, []);
  assert.equal(b.license.github_license_detected, false);
  sourceRecord(b.license, 'baseline.license');
  keys(b.owner_decision, ['type', 'upstream_permission', 'upstream_license', 'legal_clearance', 'unresolved_legal_status'], 'baseline.owner_decision');
  assert.equal(b.owner_decision.type, 'product-owner direct-use risk acceptance');
  assert.equal(b.owner_decision.upstream_permission, false);
  assert.equal(b.owner_decision.upstream_license, false);
  assert.equal(b.owner_decision.legal_clearance, false);
  assert.equal(b.owner_decision.unresolved_legal_status, true);
  keys(b.ownership, ['business_risk_owner', 'engineering_maintenance_owner', 'linear_assignment', 'all_responsibility_instruction', 'owner_confirmation'], 'baseline.ownership');
  assert.equal(b.ownership.business_risk_owner, 'Ryan Lisse');
  assert.equal(b.ownership.engineering_maintenance_owner, 'Ryan Lisse');
  for (const field of ['linear_assignment', 'all_responsibility_instruction', 'owner_confirmation']) {
    sourceRecord(b.ownership[field], `baseline.ownership.${field}`);
  }
}

const HISTORICAL = Object.freeze({
  node: '>=20', pnpm: '8.15.9', turbo_manifest: '^2.6.1', turbo_lock: '2.8.16',
  next: '15.5.6', web_react: '19.1.1', web_react_dom: '19.1.1', medusa: '2.11.3',
  api_tooling_react: '18.3.1', api_tooling_react_dom: '18.3.1',
});
const SELECTED = Object.freeze({
  node: '24.18.0', pnpm: '11.18.0', turbo: '2.10.8', next: '15.5.21',
  web_react: '19.1.2', web_react_dom: '19.1.2', medusa: '2.11.3',
  api_tooling_react: '18.3.1', api_tooling_react_dom: '18.3.1',
});

function validateMatrix(m) {
  keys(m, ['historical_reference', 'production_reference', 'maintenance_owner'], 'version matrix');
  assert.equal(m.maintenance_owner, 'Ryan Lisse');
  for (const [groupName, expected] of [['historical_reference', HISTORICAL], ['production_reference', SELECTED]]) {
    const group = object(m[groupName], `version matrix.${groupName}`);
    keys(group, Object.keys(expected), `version matrix.${groupName}`);
    keys(group, ['evidence'], `version matrix.${groupName}`);
    for (const [name, version] of Object.entries(expected)) {
      assert.equal(group[name], version, `${groupName}.${name} drifted`);
      sourceRecord(group.evidence[name], `${groupName}.evidence.${name}`);
    }
  }
}

const SURFACES = Object.freeze([
  'apps/api', 'apps/web', 'apps/mobile', 'apps/docs', 'packages/eslint-config',
  'packages/typescript-config', 'packages/ui', 'packages/template',
  'plugins/brands', 'plugins/elastic-search',
]);

function validateMigration(m) {
  keys(m, ['surfaces'], 'migration map');
  assert.ok(Array.isArray(m.surfaces), 'migration map.surfaces must be an array');
  assert.equal(m.surfaces.length, 10, 'migration map must have exactly ten explicit rows');
  assert.deepEqual(new Set(m.surfaces.map(row => row.source_path)), new Set(SURFACES), 'migration map surfaces differ');
  for (const row of m.surfaces) {
    keys(row, ['source_path', 'source_package', 'workspace_member_at_pin', 'observed_version_context', 'disposition', 'target_or_follow_up', 'reason'], `migration row ${row.source_path ?? '?'}`);
  }
  const row = path => m.surfaces.find(entry => entry.source_path === path);
  assert.equal(row('apps/api').target_or_follow_up, '@sammys/commerce');
  assert.equal(row('apps/web').target_or_follow_up, '@sammys/storefront');
  assert.match(row('apps/mobile').disposition, /^park/i);
  assert.match(row('apps/docs').disposition, /^drop/i);
  assert.match(row('packages/template').disposition, /^drop/i);
  assert.match(row('packages/ui').disposition, /^rewrite/i);
  assert.match(row('packages/eslint-config').disposition, /retain|adapt/i);
  assert.match(row('packages/typescript-config').disposition, /retain|adapt/i);
  assert.match(row('plugins/brands').disposition, /^rewrite/i);
  assert.match(row('plugins/elastic-search').disposition, /drop|defer/i);
  for (const plugin of ['plugins/brands', 'plugins/elastic-search']) {
    assert.equal(row(plugin).workspace_member_at_pin, false);
    assert.match(JSON.stringify(row(plugin).observed_version_context), /2\.11\.2/);
  }
}

function validateSecurity(s) {
  keys(s, ['retrieved_at', 'audits', 'findings'], 'security advisories');
  timestamp(s.retrieved_at, 'security advisories.retrieved_at');
  assert.ok(Array.isArray(s.audits) && s.audits.length > 0, 'at least one audit result is required');
  for (const audit of s.audits) keys(audit, ['command', 'exit_code', 'result', 'source', 'retrieved_at'], 'audit');
  assert.ok(Array.isArray(s.findings), 'security advisories.findings must be an array');
  for (const finding of s.findings) {
    keys(finding, ['id', 'severity', 'applicable', 'source', 'retrieved_at', 'disposition'], `finding ${finding.id ?? '?'}`);
    if (finding.applicable && /^(high|critical)$/i.test(finding.severity)) {
      keys(finding, ['owner', 'follow_up'], `applicable ${finding.severity} finding ${finding.id}`);
    }
  }
}

const ALLOWED_ENV = Object.freeze({
  PATH: '/usr/local/bin:/usr/bin:/bin', CI: '1', HOME: '/home/node',
  COREPACK_HOME: '/home/node/.corepack', PNPM_HOME: '/home/node/.pnpm',
  npm_config_update_notifier: 'false', npm_config_fund: 'false',
});
const GENERATED = /(^|\/)(node_modules|\.next|\.medusa|dist|build|out|\.turbo)(\/|$)/;

function validateProcess(process, label) {
  keys(process, ['env', 'uid', 'cap_eff', 'no_new_privileges'], label);
  assert.deepEqual(process.env, ALLOWED_ENV, `${label} environment is not the exact allowlist`);
  assert.notEqual(Number(process.uid), 0, `${label} must be non-root`);
  assert.match(String(process.cap_eff), /^0+$/, `${label} has effective capabilities`);
  assert.equal(Number(process.no_new_privileges), 1, `${label} lacks no-new-privileges`);
}

function command(spike, pattern, label) {
  const hit = spike.commands.find(step => pattern.test(step.command));
  assert.ok(hit, `missing ${label} command`);
  assert.equal(hit.exit_code, 0, `${label} exited nonzero`);
  timestamp(hit.timestamp, `${label}.timestamp`);
  return hit;
}

function validateSpike(s) {
  keys(s, ['upstream_url', 'upstream_commit', 'tool_versions', 'commands', 'sandbox', 'acquisition', 'offline', 'pre_commit_cleanup', 'repository_inventory', 'leaf_digests', 'sha256sums_digest'], 'spike');
  assert.equal(s.upstream_url, UPSTREAM);
  assert.equal(s.upstream_commit, PIN);
  assert.deepEqual(s.tool_versions, { node: '24.18.0', pnpm: '11.18.0' });
  assert.ok(Array.isArray(s.commands), 'spike.commands must be an array');
  command(s, /pnpm install .*--lockfile-only.*--ignore-scripts/, 'lock-only generation');
  command(s, /pnpm fetch .*--frozen-lockfile/, 'dependency fetch');
  command(s, /pnpm install .*--offline.*--frozen-lockfile/, 'offline frozen install');
  command(s, /pnpm --filter @starter\/api build/, 'API build');
  command(s, /pnpm --filter @starter\/web build/, 'web build');
  keys(s.sandbox, ['image_digests', 'acquisition_inspect', 'offline_inspect', 'acquisition_process', 'offline_process'], 'spike.sandbox');
  assert.ok(Object.keys(s.sandbox.image_digests).length >= 2, 'immutable base and acquired image digests are required');
  for (const name of ['acquisition_inspect', 'offline_inspect']) {
    const inspect = s.sandbox[name];
    keys(inspect, ['mounts', 'sockets', 'resource_limits', 'cap_drop', 'security_opt', 'user'], `sandbox.${name}`);
    assert.deepEqual(inspect.mounts, []);
    assert.deepEqual(inspect.sockets, []);
    assert.match(String(inspect.user), /^(node|[1-9]\d*)$/);
    assert.deepEqual(inspect.cap_drop, ['ALL']);
    assert.ok(inspect.security_opt.includes('no-new-privileges:true'));
    for (const limit of ['cpus', 'memory', 'pids']) assert.ok(inspect.resource_limits[limit], `${name} missing finite ${limit} limit`);
  }
  validateProcess(s.sandbox.acquisition_process, 'sandbox.acquisition_process');
  validateProcess(s.sandbox.offline_process, 'sandbox.offline_process');
  keys(s.acquisition, ['network_mode', 'completed_at'], 'spike.acquisition');
  keys(s.offline, ['network_mode', 'started_at'], 'spike.offline');
  assert.equal(s.offline.network_mode, 'none');
  timestamp(s.acquisition.completed_at, 'spike.acquisition.completed_at');
  timestamp(s.offline.started_at, 'spike.offline.started_at');
  assert.ok(Date.parse(s.offline.started_at) > Date.parse(s.acquisition.completed_at), 'offline phase must start after acquisition');
  keys(s.pre_commit_cleanup, ['before_inventory', 'after_inventory'], 'spike.pre_commit_cleanup');
  for (const path of s.pre_commit_cleanup.after_inventory) assert.doesNotMatch(path, GENERATED, `generated output remained before image commit: ${path}`);
  for (const path of s.repository_inventory) {
    assert.doesNotMatch(path, GENERATED, `generated directory leaked into repository inventory: ${path}`);
    assert.doesNotMatch(path, /^(apps|packages|plugins)\//, `upstream production source leaked into repository: ${path}`);
  }
}

function validateLinear(l) {
  keys(l, ['issue_id', 'comment_id', 'url', 'author', 'timestamp', 'comment_digest', 'criterion_replacement', 'upstream_permission', 'upstream_license', 'legal_clearance', 'engineering_maintenance_owner'], 'linear acceptance');
  assert.equal(l.author, 'Ryan Lisse');
  timestamp(l.timestamp, 'linear acceptance.timestamp');
  assert.match(l.comment_digest, /^[a-f0-9]{64}$/);
  assert.equal(l.criterion_replacement, 'product-owner direct-use risk acceptance');
  assert.equal(l.upstream_permission, false);
  assert.equal(l.upstream_license, false);
  assert.equal(l.legal_clearance, false);
  assert.ok(String(l.engineering_maintenance_owner).length > 0, 'engineering maintenance owner is required');
}

function validateMaintenanceOwner(l) {
  validateLinear(l);
  if (l.engineering_maintenance_owner !== 'Ryan Lisse') {
    keys(l, ['replacement_owner_approval'], 'linear acceptance replacement owner');
    keys(l.replacement_owner_approval, ['approved_by', 'approved', 'source', 'retrieved_at'], 'replacement owner approval');
    assert.equal(l.replacement_owner_approval.approved_by, 'Ryan Lisse');
    assert.equal(l.replacement_owner_approval.approved, true);
    sourceRecord(l.replacement_owner_approval, 'replacement owner approval');
  }
}

function validateAdr(adr) {
  for (const heading of ['Decision', 'Drivers', 'Alternatives', 'Consequences']) {
    assert.match(adr, new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'im'), `ADR missing ${heading} section`);
  }
  for (const phrase of ['product-owner direct-use risk acceptance', 'Ryan Lisse', 'business-risk owner', 'engineering-maintenance owner', 'clean-room', 'rollback']) {
    assert.match(adr, new RegExp(phrase, 'i'), `ADR missing ${phrase}`);
  }
  assert.match(adr, /not upstream permission/i);
  assert.match(adr, /not (?:an )?upstream license/i);
  assert.match(adr, /not legal clearance/i);
}

const PATCH_PATHS = new Set(['package.json', 'apps/web/package.json', 'pnpm-workspace.yaml']);
function validatePatch(patch) {
  assert.doesNotMatch(patch, /(^|\n)(deleted file mode|new file mode|rename (?:from|to)|GIT binary patch|Binary files)|\/dev\/null/, 'patch contains deletion/new/rename/binary content');
  const headers = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  assert.ok(headers.length > 0, 'patch contains no file diffs');
  for (const [, before, after] of headers) {
    assert.equal(before, after, 'patch renames a path');
    assert.ok(PATCH_PATHS.has(before), `patch path is not allowlisted: ${before}`);
  }
  assert.doesNotMatch(patch, /(?:^|\/)(src|lib|server|components)\//m, 'source path present in reduction patch');
  const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1).trim()).filter(Boolean);
  const allowed = /^(?:[{}\[\],]|"(?:packageManager|devDependencies|turbo|dependencies|next|react|react-dom)"\s*:|"(?:pnpm@11\.18\.0|2\.10\.8|15\.5\.21|19\.1\.2)"[,}]?$|packages:|-[ ]?(?:apps\/api|apps\/web|packages\/eslint-config|packages\/typescript-config)$)/;
  for (const line of added) assert.match(line, allowed, `patch adds non-allowlisted key/value or feature payload: ${line}`);
  assert.doesNotMatch(patch, /^\+\s*"scripts"\s*:/m, 'patch adds a script');
}

async function validateChecksums(spike, sums) {
  assert.doesNotMatch(sums, /(?:^|\s)(?:SHA256SUMS|spike\.json)(?:\s|$)/m, 'checksum graph is cyclic');
  assert.equal(digest(sums), spike.sha256sums_digest, 'SHA256SUMS one-way digest mismatch');
  const lines = sums.trim().split('\n').filter(Boolean);
  assert.ok(lines.length > 0, 'SHA256SUMS is empty');
  const listed = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line);
    assert.ok(match, `invalid SHA256SUMS line: ${line}`);
    const [, expected, relative] = match;
    assert.ok(!relative.startsWith('/') && !relative.includes('..'), `unsafe checksum path: ${relative}`);
    listed.add(relative);
    assert.equal(digest(await readFile(join(EVIDENCE, relative))), expected, `leaf digest mismatch: ${relative}`);
    assert.equal(spike.leaf_digests[relative], expected, `spike leaf digest mismatch: ${relative}`);
  }
  const requiredLeaves = new Set([
    'spike-input/package.json', 'spike-input/apps-api.package.json',
    'spike-input/apps-web.package.json', 'spike-input/pnpm-workspace.yaml',
    'spike-input/pnpm-lock.yaml', 'spike-input/workspace-reduction.patch',
    'transcripts/acquisition.log', 'transcripts/offline-build.log',
    'captures/acquisition-inspect.json', 'captures/offline-inspect.json',
    'captures/acquisition-process.json', 'captures/offline-process.json',
  ]);
  assert.deepEqual(listed, requiredLeaves, 'SHA256SUMS must bind the complete leaf-only evidence set');
  assert.deepEqual(new Set(Object.keys(spike.leaf_digests)), listed, 'spike leaf map and SHA256SUMS differ');
}

test('C01 canonical content artifacts exist and JSON artifacts parse; run history is excluded', async () => {
  assert.ok(!Object.values(ARTIFACTS).some(path => /test-runs|run-provenance/.test(path)), 'provenance artifact leaked into first-Green requirements');
  const missing = [];
  const malformed = [];
  for (const [kind, relative] of Object.entries(ARTIFACTS)) {
    if (!await exists(join(ROOT, relative))) missing.push(`${kind}: ${relative}`);
  }
  for (const kind of JSON_ARTIFACTS) {
    if (missing.some(item => item.startsWith(`${kind}:`))) continue;
    try { JSON.parse(await readFile(pathOf(kind), 'utf8')); } catch (error) { malformed.push(`${kind}: ${error.message}`); }
  }
  assert.deepEqual({ missing, malformed }, { missing: [], malformed: [] }, `canonical artifact classes incomplete\nmissing:\n${missing.join('\n')}\nmalformed:\n${malformed.join('\n')}`);
});
test('C02 baseline URL equals canonical upstream URL', async () => assert.equal((await readJson('baseline')).upstream_url, UPSTREAM));
test('C03 full commit pin equals recorded checkout verification', async () => { const b = await readJson('baseline'); assert.equal(b.commit, PIN); assert.equal(b.commit_verification, PIN); });
test('C04 root license fact is UNLICENSED', async () => assert.equal((await readJson('baseline')).license?.root_package_license, 'UNLICENSED'));
test('C05 absent root license files and GitHub detection have source/date metadata', async () => validateBaseline(await readJson('baseline')));
test('C06 owner decision is typed product-owner direct-use risk acceptance', async () => assert.equal((await readJson('baseline')).owner_decision?.type, 'product-owner direct-use risk acceptance'));
test('C07 owner acceptance is not permission, a license, or legal clearance', async () => { const d = (await readJson('baseline')).owner_decision; assert.deepEqual([d.upstream_permission, d.upstream_license, d.legal_clearance], [false, false, false]); });
test('C08 Ryan Lisse has both named roles and three cited confirmations', async () => validateBaseline(await readJson('baseline')));
test('C09 historical facts and selected production-reference pins are separate and exact', async () => validateMatrix(await readJson('matrix')));
test('C10 every matrix value has evidence source and retrieval date', async () => validateMatrix(await readJson('matrix')));
test('C11 migration map enumerates all ten explicit surfaces', async () => validateMigration(await readJson('migration')));
test('C12 API/web target names and parked mobile are exact', async () => validateMigration(await readJson('migration')));
test('C13 docs/template/UI/config/plugin dispositions and plugin facts are exact', async () => validateMigration(await readJson('migration')));
test('C14 ADR contains decision structure, owners, consequences, and clean-room rollback', async () => validateAdr(await readText('adr')));
test('C15 spike pins tools and uses fresh lock, fetch, real offline install, and successful retained builds', async () => validateSpike(await readJson('spike')));
test('C16 audit evidence is dated and all applicable high/critical findings are dispositioned', async () => validateSecurity(await readJson('security')));
test('C18 repository inventory excludes source and generated dependency/build directories', async () => validateSpike(await readJson('spike')));
test('C19 sandbox evidence proves immutable images, no mounts/sockets, finite limits, and exact in-process isolation', async () => validateSpike(await readJson('spike')));
test('C20 offline verification uses NetworkMode none after acquisition', async () => validateSpike(await readJson('spike')));
test('C21 transformed inputs, lock, patch, transcripts, captures, and acyclic leaf hashes verify', async () => validateChecksums(await readJson('spike'), await readText('sums')));
test('C23 Linear evidence binds Ryan-authored criterion replacement without permission claims', async () => validateLinear(await readJson('linear')));
test('C24 Linear evidence confirms Ryan or an approved replacement engineering owner', async () => validateMaintenanceOwner(await readJson('linear')));
test('C25 acquisition is lock-only plus fetch, cleanup is clean, and offline install is real', async () => validateSpike(await readJson('spike')));
test('C26 reduction patch contains only allowlisted paths and structured changes', async () => validatePatch(await readText('patch')));

const fixtureBaseline = () => ({
  upstream_url: UPSTREAM, commit: PIN, commit_verification: PIN,
  commit_metadata: { source: 'git', retrieved_at: '2026-07-31T12:00:00Z' },
  license: { root_package_license: 'UNLICENSED', root_license_files: [], github_license_detected: false, source: 'GitHub', retrieved_at: '2026-07-31T12:00:00Z' },
  owner_decision: { type: 'product-owner direct-use risk acceptance', upstream_permission: false, upstream_license: false, legal_clearance: false, unresolved_legal_status: true },
  ownership: Object.fromEntries(['linear_assignment', 'all_responsibility_instruction', 'owner_confirmation'].map(name => [name, { source: name, retrieved_at: '2026-07-31T12:00:00Z' }]).concat([['business_risk_owner', 'Ryan Lisse'], ['engineering_maintenance_owner', 'Ryan Lisse']])),
});
const fixtureMatrix = () => ({
  historical_reference: { ...HISTORICAL, evidence: Object.fromEntries(Object.keys(HISTORICAL).map(k => [k, { source: 'manifest', retrieved_at: '2026-07-31T12:00:00Z' }])) },
  production_reference: { ...SELECTED, evidence: Object.fromEntries(Object.keys(SELECTED).map(k => [k, { source: 'official', retrieved_at: '2026-07-31T12:00:00Z' }])) },
  maintenance_owner: 'Ryan Lisse',
});
const fixtureMigration = () => ({ surfaces: SURFACES.map(source_path => ({
  source_path, source_package: `@starter/${source_path.split('/').at(-1)}`, workspace_member_at_pin: !source_path.startsWith('plugins/'), observed_version_context: source_path.startsWith('plugins/') ? 'Medusa 2.11.2' : 'observed at pin', disposition: source_path === 'apps/api' || source_path === 'apps/web' || /config/.test(source_path) ? 'retain/adapt' : source_path === 'apps/mobile' ? 'park' : /ui|brands/.test(source_path) ? 'rewrite' : 'drop/defer', target_or_follow_up: source_path === 'apps/api' ? '@sammys/commerce' : source_path === 'apps/web' ? '@sammys/storefront' : 'follow-up', reason: 'bounded decision',
})) });
const fixtureSecurity = () => ({ retrieved_at: '2026-07-31T12:00:00Z', audits: [{ command: 'pnpm audit --json', exit_code: 1, result: 'findings', source: 'pnpm registry', retrieved_at: '2026-07-31T12:00:00Z' }], findings: [{ id: 'X', severity: 'high', applicable: true, source: 'OSV', retrieved_at: '2026-07-31T12:00:00Z', disposition: 'follow-up', owner: 'Ryan Lisse', follow_up: 'RJC-X' }] });
const fixtureLinear = () => ({ issue_id: 'RJC-256', comment_id: 'c', url: 'https://linear.app/x', author: 'Ryan Lisse', timestamp: '2026-07-31T12:00:00Z', comment_digest: 'a'.repeat(64), criterion_replacement: 'product-owner direct-use risk acceptance', upstream_permission: false, upstream_license: false, legal_clearance: false, engineering_maintenance_owner: 'Ryan Lisse' });
const fixtureSpike = () => ({
  upstream_url: UPSTREAM, upstream_commit: PIN, tool_versions: { node: '24.18.0', pnpm: '11.18.0' },
  commands: [
    ['pnpm install --lockfile-only --ignore-scripts', 0], ['pnpm fetch --frozen-lockfile', 0],
    ['pnpm install --offline --frozen-lockfile', 0], ['pnpm --filter @starter/api build', 0], ['pnpm --filter @starter/web build', 0],
  ].map(([command, exit_code]) => ({ command, exit_code, timestamp: '2026-07-31T12:00:01Z' })),
  sandbox: {
    image_digests: { base: `sha256:${'1'.repeat(64)}`, acquired: `sha256:${'2'.repeat(64)}` },
    acquisition_inspect: { mounts: [], sockets: [], resource_limits: { cpus: 4, memory: '6g', pids: 512 }, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], user: 'node' },
    offline_inspect: { mounts: [], sockets: [], resource_limits: { cpus: 4, memory: '6g', pids: 512 }, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], user: 'node' },
    acquisition_process: { env: ALLOWED_ENV, uid: 1000, cap_eff: '0000000000000000', no_new_privileges: 1 },
    offline_process: { env: ALLOWED_ENV, uid: 1000, cap_eff: '0000000000000000', no_new_privileges: 1 },
  },
  acquisition: { network_mode: 'bridge', completed_at: '2026-07-31T12:00:02Z' }, offline: { network_mode: 'none', started_at: '2026-07-31T12:00:03Z' },
  pre_commit_cleanup: { before_inventory: ['node_modules'], after_inventory: [] }, repository_inventory: ['docs/evidence/rjc-256/spike.json'], leaf_digests: {}, sha256sums_digest: 'a'.repeat(64),
});

async function malformedJson(name, fixture, mutate, validator) {
  const directory = await mkdtemp(join(tmpdir(), `rjc-256-${name}-`));
  try {
    const path = join(directory, 'artifact.json');
    const changed = structuredClone(fixture());
    mutate(changed);
    await writeFile(path, `${JSON.stringify(changed, null, 2)}\n`);
    const reread = JSON.parse(await readFile(path, 'utf8'));
    assert.throws(() => validator(reread), undefined, `${name} mutation was accepted`);
  } finally {
    await rm(directory, { recursive: true });
  }
}

for (const [name, fixture, validator] of [
  ['baseline', fixtureBaseline, validateBaseline], ['version-matrix', fixtureMatrix, validateMatrix],
  ['migration-map', fixtureMigration, validateMigration], ['security-advisories', fixtureSecurity, validateSecurity],
  ['spike', fixtureSpike, validateSpike], ['linear-acceptance', fixtureLinear, validateLinear],
]) {
  test(`mutation ${name}: deleting a required top-level field is rejected semantically`, async () => {
    const first = Object.keys(fixture())[0];
    await malformedJson(`${name}-missing-field`, fixture, value => delete value[first], validator);
  });
}

test('mutation pin/license/permission/owner variants are rejected semantically', async () => {
  await malformedJson('pin', fixtureBaseline, b => { b.commit = `${PIN.slice(0, -1)}0`; }, validateBaseline);
  await malformedJson('license', fixtureBaseline, b => { b.license.root_package_license = 'MIT'; }, validateBaseline);
  await malformedJson('permission', fixtureBaseline, b => { b.owner_decision.upstream_permission = true; }, validateBaseline);
  await malformedJson('owner', fixtureBaseline, b => { delete b.ownership.engineering_maintenance_owner; }, validateBaseline);
});
test('mutation missing/plugin migration rows are rejected semantically', async () => {
  await malformedJson('migration-row', fixtureMigration, m => m.surfaces.pop(), validateMigration);
  await malformedJson('plugin-member', fixtureMigration, m => { m.surfaces.find(r => r.source_path === 'plugins/brands').workspace_member_at_pin = true; }, validateMigration);
  await malformedJson('plugin-version', fixtureMigration, m => { m.surfaces.find(r => r.source_path === 'plugins/elastic-search').observed_version_context = '2.11.3'; }, validateMigration);
});
test('mutation historical versions promoted or React contexts conflated are rejected semantically', async () => {
  for (const [name, mutate] of [
    ['turbo-lock', m => { m.production_reference.turbo = '2.8.16'; }],
    ['turbo-range', m => { m.production_reference.turbo = '^2.6.1'; }],
    ['pnpm', m => { m.production_reference.pnpm = '8.15.9'; }],
    ['next', m => { m.production_reference.next = '15.5.6'; }],
    ['react', m => { m.production_reference.web_react = '18.3.1'; }],
  ]) await malformedJson(name, fixtureMatrix, mutate, validateMatrix);
});
test('mutation nonzero build and residual cleanup output are rejected semantically', async () => {
  await malformedJson('build-exit', fixtureSpike, s => { s.commands.find(c => /api build/.test(c.command)).exit_code = 1; }, validateSpike);
  await malformedJson('cleanup', fixtureSpike, s => { s.pre_commit_cleanup.after_inventory.push('.next/cache'); }, validateSpike);
});
test('mutation sandbox authority, environment, UID, capabilities, and offline network are rejected', async () => {
  for (const [name, mutate] of [
    ['mount', s => s.sandbox.offline_inspect.mounts.push('/sammy')],
    ['socket', s => s.sandbox.acquisition_inspect.sockets.push('/var/run/docker.sock')],
    ['secret-env', s => { s.sandbox.offline_process.env.API_TOKEN = 'secret'; }],
    ['ssh-env', s => { s.sandbox.acquisition_process.env.SSH_AUTH_SOCK = '/agent'; }],
    ['root', s => { s.sandbox.offline_process.uid = 0; }],
    ['caps', s => { s.sandbox.offline_process.cap_eff = '0000000000000001'; }],
    ['network', s => { s.offline.network_mode = 'bridge'; }],
  ]) await malformedJson(name, fixtureSpike, mutate, validateSpike);
});
test('mutation agent author, omitted override, or permission claim in Linear evidence is rejected', async () => {
  await malformedJson('linear-author', fixtureLinear, l => { l.author = 'automation bot'; }, validateLinear);
  await malformedJson('linear-override', fixtureLinear, l => { l.criterion_replacement = ''; }, validateLinear);
  await malformedJson('linear-permission', fixtureLinear, l => { l.upstream_permission = true; }, validateLinear);
});
test('mutation patch unknown/source/deletion/binary/script/feature payload is rejected', async () => {
  const variants = [
    'diff --git a/apps/web/src/page.tsx b/apps/web/src/page.tsx\n+x',
    'diff --git a/package.json b/package.json\ndeleted file mode 100644',
    'diff --git a/package.json b/package.json\nGIT binary patch',
    'diff --git a/package.json b/package.json\n+  "scripts": {"steal": "curl x"}',
    'diff --git a/package.json b/package.json\n+  "feature": "embedded-code"',
  ];
  for (const [index, source] of variants.entries()) {
    const directory = await mkdtemp(join(tmpdir(), `rjc-256-patch-${index}-`));
    try { const path = join(directory, 'workspace-reduction.patch'); await writeFile(path, source); assert.throws(() => validatePatch(source)); }
    finally { await rm(directory, { recursive: true }); }
  }
});
test('mutation retained leaf byte and checksum self/mutual cycles are rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rjc-256-digest-'));
  try {
    const leaf = join(directory, 'leaf');
    await writeFile(leaf, 'before');
    const expected = digest(await readFile(leaf));
    await writeFile(leaf, 'after');
    assert.notEqual(digest(await readFile(leaf)), expected, 'retained byte mutation did not change its digest');
    for (const relative of ['SHA256SUMS', 'spike.json']) {
      const cyclic = `${'a'.repeat(64)}  ${relative}\n`;
      await assert.rejects(() => validateChecksums({ sha256sums_digest: digest(cyclic), leaf_digests: {} }, cyclic), /cyclic/);
    }
  } finally { await rm(directory, { recursive: true }); }
});
test('named canonical case vector is stable and excludes provenance/run-history requirements', () => {
  assert.deepEqual(CASE_VECTOR, ['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12','C13','C14','C15','C16','C18','C19','C20','C21','C23','C24','C25','C26']);
  assert.ok(CASE_VECTOR.every(id => /^C\d{2}$/.test(id)));
});
