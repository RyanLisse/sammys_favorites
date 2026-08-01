# RJC-256 iteration-9 attempt-6 content-addressed consensus amendment

Status: **v2.7 superseded without Green; v2.8 frozen Red; pending fresh Architect then fresh Critic review**
Autopilot phase: `ralplan`, iteration 9
Parent plan: `.omx/plans/rjc-256-prd.md`
Prior acquisition amendment: `.omx/plans/rjc-256-rate-limit-acquisition-amendment.md`

## Why RALPLAN reopened

Attempt 4 proved that the rate-limit recovery works. A fresh no-mount container using Node `24.18.1`, Corepack-bound pnpm `11.18.0`, network concurrency 1, and the approved bounded retry schedule recovered both Medusa 429 responses, resolved all 1,503 packages, and completed in 1,137 seconds without watchdog termination or OOM.

Strict peer validation then rejected four incompatible selections:

| Installed | Required by resolved graph | Compatible selection |
|---|---|---|
| Vite `8.2.0` | `@medusajs/types@2.18.0` requires `^5.4.21` | Vite `5.4.21` |
| TypeScript `6.0.3` | `cva@1.0.0-beta.1` requires `>=4.5.5 <6` | TypeScript `5.9.3` |
| picomatch `4.0.5` | `fdir@6.1.1` requires optional peer `3.x` | Direct API peer provider `picomatch@3.0.2` |
| ESLint `10.8.0` | `eslint-plugin-react@7.37.5` supports through `^9.7` | ESLint `9.39.5` and matching `@eslint/js@9.39.5` |

Checksummed attempt-4 evidence is `docs/evidence/rjc-256/failures/g003b-attempt4-evidence.sha256`. No lock, fetch, offline install, build, audit, first Green, Linear mutation, or RJC-257 work was claimed.

## Decision

Create an immutable, full content-addressed compatibility child of the existing sealed T0 snapshot. Keep the parent snapshot unchanged. The child carries all 44 effective declaration rows, the complete manifest allowlist, and a 33-package registry inventory. It changes only declarations proven incompatible by attempt 4 and adds one direct peer provider:

- Vite `5.4.21` in `apps/api/package.json`;
- TypeScript `5.9.3` in API, web, root, and shared ESLint config;
- ESLint `9.39.5` in web, root, and shared ESLint config;
- `@eslint/js` `9.39.5` in shared ESLint config;
- direct API devDependency `picomatch` `3.0.2` so `fdir@6.1.1` receives its declared 3.x peer while Jest/Vite consumers may retain their own picomatch 4 edges.

The full child envelope is:

- `docs/evidence/rjc-256/latest-resolution-peer-compatible-child.json`
- RFC 8785/JCS snapshot ID `sha256:038e13ce9feeca3afc4fa559d8ccf8790ac5f39bf13e560d512953ad269d22b2`
- byte SHA-256 `25d5e5b8da2735c5367991c056cf3889b0ce543a54f950e2c5b908d16e4d4897`
- digest file `docs/evidence/rjc-256/latest-resolution-peer-compatible-child.digest`
- parent snapshot `sha256:7a654c2a5d29a85cbd0de3dd8e093485c8199a6aca790fea0dbd7d645457002c`
- parent T0 `2026-07-31T22:58:40.544Z`
- exactly 44 declarations, 33 inventory entries, nine replacements, and one direct API devDependency addition

The nine replacement rows are selected from the sealed parent registry capture. Picomatch is represented by the bounded late-metadata extension `docs/evidence/rjc-256/captures/picomatch-late-metadata-extension.json` (`sha256:127303ce5377b3c542a92bdad434e36d65097f382ca02cf9128d2836bc8852b9`). It binds the full 128,942-byte packument (`sha256:574b1d399f007b7aa461e11b79303252df824129bb43322eaf8ffb219920792f`), sanitized response headers (`sha256:4826ed7bee7547a8e5b7e8f83b326d4dd73ea944278633370c2eb09995296c9c`), ETag, explicit post-T0 retrieval time, all 33 versions published by parent T0, and rejection proof for every higher stable 4.x candidate. This extension digest is bound into the child envelope; it is not represented as part of the original parent registry bytes.

## Why direct picomatch instead of an override

Official pnpm 11 documentation says root overrides can change dependencies and peers. A checksummed no-mount exact pnpm `11.18.0` strict-peer probe proves that the supported workspace override `fdir@6.1.1>picomatch: 3.0.2` narrows the peer request but does not supply a separate picomatch 3 instance when picomatch 4 remains visible. pnpm exits 1 with `ERR_PNPM_PEER_DEP_ISSUES`; the lock shows the peer range rewritten to `3.0.2` while the effective edge remains `fdir@6.1.1(picomatch@4.0.5)`.

The exact override inputs, supported workspace setting, command, script, transcript, pnpm output, lock, result, discarded preflight record, and checksums are preserved under `docs/evidence/rjc-256/captures/picomatch-override-only-failure-probe*`. The result SHA-256 is `1603954e68529b45979adeb0266a0b70cc24e6337c039a2f7ba678f81f96554c`; `picomatch-override-only-failure-probe.sha256` (`0874065e99783fc59cac580a58821ffeb26ffd82b6fd476420b646eb1486e400`) verifies all ten leaves.

A second disposable no-mount probe with exact pnpm `11.18.0` and direct `picomatch@3.0.2` exited 0 and produced `fdir@6.1.1(picomatch@3.0.2)` while retaining picomatch 4 for its independent consumer. Its input manifests, exact command, script, transcript, lock, lock excerpt, result, preflight record, and checksums are preserved under `docs/evidence/rjc-256/captures/picomatch-direct-provider-probe*`; `picomatch-direct-provider-probe.sha256` verifies all ten leaves. The amendment therefore adds a normal exact devDependency rather than weakening strict peers, changing pnpm config, or overriding Medusa's exact `fdir` dependency.

## v2.5 child-bound Red lineage frozen before attempt 5

The immutable v2.1 test is archived at `docs/evidence/rjc-256/superseded/v2.1/rjc-256-conformance.test.mjs` with SHA-256 `db90bd214ed5f0a46798703d2e7b905c5717e51393eb887f58d9f3ce2c523ce8`, Git blob `f8310f2677a4e9a7240c85ed02d8fe6f564f6ba0`, and status `superseded_without_green`.

The immutable v2.2 test is also archived unchanged at `docs/evidence/rjc-256/superseded/v2.2/rjc-256-conformance.test.mjs`, SHA-256 `0a88c3cc1a433eadfbcf3f006dff68d28e2a5afab1fd8eb9feece9b8a1b0601b`, Git blob `6692b977de601a7c9c359c254bef1c6e538c40aa`, with status `superseded_without_green`. Its original evidence manifest remains byte-identical at SHA-256 `ff27fdf1d759d4c11237385ea36864f7b0995514bd8cd4cd48638030a9835e0b`; its exact era run index is archived separately at SHA-256 `c12ab8038e55a8f3bcb3ab02b4f512f472359cebef3060d9ec4acb2a3aa666e8`.

The v2.3 test is archived byte-identically at `docs/evidence/rjc-256/superseded/v2.3/rjc-256-conformance.test.mjs`, SHA-256 `8babb29ce8e24cefd27bd4dc2660112a538c0f4de830b3988459e75aea51a3f2`, Git blob `3e37b736033cf0fa2c3da16161538c8147351d19`, with status `superseded_without_green`. Its original Red metadata and transcript remain `cb86cb6979bec8984424468ba988eb4d28be7d597ba5520e54084ab4070812a9` and `e4c0db833ad92b7856f09e5b1d6accd677e837860339bb507de70170eec4c106`; the archived run index is `232c2d08342a62f9be7e8c0e4be4af3e889daf85a3083f7cdc798ea43d930286`, and the archived v2.3 evidence manifest is `5c9ab27836c88b9d201d4800735d2fd330e4f51ca095f51df84ede3915dbb4d7`.

The v2.4 test is archived byte-identically at `docs/evidence/rjc-256/superseded/v2.4/rjc-256-conformance.test.mjs`, SHA-256 `f471865c07b73f6b8384e5f59616deffbdf3d414e2a0b557c1597252ac84a50c`, Git blob `c9f3da95f44850f4320e68d5647ac603926fbcf2`, with status `superseded_without_green`. Its original Red metadata and transcript remain `979c5c55de7e68c220cf41574f877002effe2d58664124143c39e6fb666170e1` and `09105a8b48cf1a3835108e3ab7e9ffd5b02b64b52162a7aa7af7a829583a221c`; the archived run index is `0e95e9c7a9beb858e0847015545d7cefddbab205769e0ff98369764b0446512f`, and the archived v2.4 evidence manifest is `705233099acfef7fc2ed3d3cf534787c46b1f0e278aded48330b9222e0ff5103`.

The active v2.5 test is `test/rjc-256-conformance.test.mjs`, SHA-256 `c9296f6b41fad62d0c62b306b7d7e9d6697ce9b22e03c28b73f3eec1a72b4788`, Git blob `a553c4fd43b4f3aeba6e6fd252d9d5b51d3f57d6`. The genuine sanitized v2.5 Red is recorded in `docs/evidence/rjc-256/red-v2-5-run.json` (`2c31a536573a532d120cc4937e6aa09022bd5f26d219b7eb63d9ff6bc63fc8aa`) and `docs/evidence/rjc-256/transcripts/red-v2-5-conformance.log` (`15101b495bee278d08198b8447de2d02ccc419589a19bc501c6560474df47fbd`): 68 total, 55 pass, 13 expected downstream-artifact failures, 0 skipped. The failures remain exactly V201, V205, V215–V224, and V228 because attempt-5 and Linear outputs do not exist. `docs/evidence/rjc-256/v2-5-evidence.sha256` (`049b4ba5bac59ddd060ee63219e816435013ee99fda5d93dbd74142bacea804c`) verifies the active lineage, archived v2.4 lineage, and both probes.

v2.5 preserves v2.4's removal of `rjc256_snapshot_id` from executable manifests and the raw lock. Exact transformed-input provenance remains transitive through child-bound `spike.json`: every retained before/after transform byte, the raw lock, and the reduction patch must have the same exact SHA-256 in both `artifact_hashes` and `leaf_digests`, and leaf-only `SHA256SUMS` must independently read-verify those bytes without listing itself or `spike.json`.

The six retained original-input leaves are:

- `docs/evidence/rjc-256/spike-input/before/package.json`;
- `docs/evidence/rjc-256/spike-input/before/apps-api.package.json`;
- `docs/evidence/rjc-256/spike-input/before/apps-web.package.json`;
- `docs/evidence/rjc-256/spike-input/before/packages-eslint-config.package.json`;
- `docs/evidence/rjc-256/spike-input/before/packages-typescript-config.package.json`;
- `docs/evidence/rjc-256/spike-input/before/pnpm-workspace.yaml`.

V217 parses before/after JSON and packages-only workspace YAML semantically. It permits only the 44 child declaration values, root/API Node engine `24.18.1`, root package manager `pnpm@11.18.0`, and the exact four-member workspace list that yields five importers including root. It preserves scripts exactly; rejects unknown JSON keys/payloads, arbitrary workspace settings, overrides, source/config/file payloads, and post-patch drift; then applies the preserved patch with isolated `git apply` and requires byte-identical output. V250 and V251 require `node_heap_mb === 4096` and exactly one `--max-old-space-size=4096` argv flag immediately after Node and immediately before verified Corepack. Missing, altered, duplicated, or metadata-mismatched heap flags reject. The focused v2.5 archive/heap boundary passes 5/5. Attempt 5 remains false and unauthorized in every artifact.

## Preserved decisions

These stay exact and unchanged:

- Node `24.18.1`;
- pnpm `11.18.0` through the hash-bound Corepack entrypoint;
- Next.js `16.2.12`;
- storefront React and React DOM `19.2.8`;
- Medusa packages `2.18.0`;
- upstream commit `10b5d4b0623123737854a3cb02d54f6e32a1fb9e`;
- five retained workspace importers;
- `strictPeerDependencies=true` and `engineStrict=true`;
- no npm, Bun, Deno, alternate registry, credentials, proxy, host cache, bind mount, source/config/script migration, or RJC-257 work.

## Attempt-5 acquisition protocol

Attempt 5 may start only after a fresh native Architect APPROVE followed by a fresh native Critic APPROVE is persisted in the repository-local session tracker and Autopilot state.

The executor creates a new no-mount acquisition container from image digest `sha256:9b02ede55039f443ad57453a741813c6cd105873f0f66fee95d25529e1ba0533` with the same isolation and resource limits as attempt 4. The parent resolution, full child envelope, late-metadata extension, raw packument, response headers, and direct-provider probe evidence are copied into the container before launch and hash-checked in-process.

Transformation order:

1. Verify all parent digests, parent snapshot ID/T0, 43 parent declarations, child byte digest and JCS snapshot ID, child parent linkage, late-extension/probe bindings, 33-package inventory, nine unique replacements, one unique addition, and exactly 44 effective declarations.
2. Clone and detach the same upstream commit.
3. Delete only the old `pnpm-lock.yaml`.
4. Apply exactly the 44 declaration values from the full child envelope.
5. Prove the difference from the parent is exactly the declared nine replacements plus `apps/api/package.json:devDependencies:picomatch=3.0.2`.
6. Set root and API Node engine `24.18.1`, root package manager `pnpm@11.18.0`, and reduce `pnpm-workspace.yaml` to the same five importers. Do not add pnpm settings or overrides.
7. Prove scripts are byte-semantically unchanged, every effective declaration matches the child, and only the same allowlisted manifest/workspace paths plus lock deletion changed.
8. Preserve the reduction patch before dependency acquisition.

Run exactly one canonical full-workspace lock invocation, with no shell wrapper and no outer retry:

```text
/usr/bin/timeout --signal=TERM --kill-after=30s 1800s \
  /usr/local/bin/node \
  --max-old-space-size=4096 \
  /usr/local/lib/node_modules/corepack/dist/corepack.js \
  pnpm install --lockfile-only --ignore-scripts \
  --network-concurrency=1 \
  --fetch-retries=5 \
  --fetch-retry-factor=2 \
  --fetch-retry-mintimeout=60000 \
  --fetch-retry-maxtimeout=300000 \
  --config.engine-strict=true \
  --config.strict-peer-dependencies=true
```

The command object must bind that exact argv, `node_heap_mb: 4096`, exactly one matching heap flag in the required position, the verified Corepack entrypoint SHA-256, pnpm `11.18.0`, `timeout_seconds: 1800`, `term_signal: TERM`, `kill_after_seconds: 30`, and `outer_retry: false`. The expected peer result is zero unmet peers, including an effective `fdir@6.1.1(picomatch@3.0.2)` edge.

On lock success, continue the already approved G003b protocol without weakening it:

1. verify exactly five importers;
2. run `pnpm fetch --frozen-lockfile` with network concurrency 1;
3. capture production and full audit JSON plus command exit states;
4. prove cleanup removed `node_modules` and all build/cache outputs;
5. commit the stopped acquisition container to a content-addressed local image;
6. create a new `--network none` container with an initially dependency-tree-free workspace;
7. run a real `pnpm install --offline --frozen-lockfile` and prove the lock hash does not change;
8. build API and Next.js 16 web, run web lint/typecheck, ESLint config import smoke, and the bounded API Jest/SWC smoke already specified by the parent plan;
9. import only approved evidence, verify leaf checksums, and keep upstream source/generated outputs outside the Sammy repository.

## Why iteration 7 reopened

Attempt 5 is terminal and immutable. Docker created the configured target `Config.WorkingDir` `/home/node/work/upstream` before PID1, so the fail-closed pre-clone absence assertion stopped the run. No clone, registry request, Corepack preparation, pnpm process, canonical lock invocation, fetch, audit, offline install, build, Linear mutation, or RJC-257 work ran. The preserved stop evidence is `docs/evidence/rjc-256/failures/g003b-attempt5-stop.json`, SHA-256 `feef5f901a88d5f2863fca2a1afa9cb4802a768a05fa9e48f80646fd36a44c0f`; its checksum manifest has SHA-256 `09f501473d24186265009922c75fee835fcc0520df89f1936eb9e37bec21d3cd`. The earlier permissions-only discarded preflight remains separately preserved at SHA-256 `245f26c67c4aa87b5c9c228bffbc0922305c83e1321c8d4c53510f8a8829973a`.

The v2.5 lineage was archived byte-identically before v2.6 was authored:

- archived test SHA-256 `c9296f6b41fad62d0c62b306b7d7e9d6697ce9b22e03c28b73f3eec1a72b4788`, Git blob `a553c4fd43b4f3aeba6e6fd252d9d5b51d3f57d6`;
- original Red metadata SHA-256 `2c31a536573a532d120cc4937e6aa09022bd5f26d219b7eb63d9ff6bc63fc8aa`;
- original sanitized Red transcript SHA-256 `15101b495bee278d08198b8447de2d02ccc419589a19bc501c6560474df47fbd`;
- archived run-index SHA-256 `84e9aa51d575a5bdf24dde2f9e5d85d07d4f1bdb792233776333fb2d5c0d7903`;
- archived evidence-manifest SHA-256 `049b4ba5bac59ddd060ee63219e816435013ee99fda5d93dbd74142bacea804c`.

`docs/evidence/rjc-256/superseded/v2.5/supersession.json` binds that history, the terminal attempt-5 evidence, successor `v2.6`, and `attempt_6_authorized:false` / `attempt_6_started:false`.

## RALPLAN-DR iteration-7 decision

Principles:

1. Preserve every earlier lineage byte-for-byte.
2. Prove pre-clone isolation from observed state.
3. Keep the canonical pnpm child argv exact and shell-free.
4. Separate valid vulnerability findings from audit transport/tool/protocol failure.
5. Stop after any terminal attempt-6 failure; never repair or retry automatically.

Decision drivers are the attempt-5 working-directory failure, preservation of the v2.5 heap/Corepack/lock contract, and pnpm `11.18.0` returning exit 1 for a valid non-empty filtered advisory report.

Options considered:

- **A — selected:** create with neutral, pre-existing `Config.WorkingDir=/home/node`; prove the target absent before clone; use target `--workdir` only on the direct post-clone `docker exec`; classify audits by exit plus strict JSON shape.
- **B — rejected:** omit an explicit neutral workdir and depend on the image default, which leaves drift and provenance ambiguity.
- **C — invalid:** retain target `Config.WorkingDir` and weaken the absence assertion, which conceals the exact failure this gate must detect.
- **D — rejected:** wrap the lock command with `cd` in a shell, which changes the child-process contract and defeats exact argv evidence.

ADR: adopt Option A. The consequence is one additional lifecycle evidence object plus deterministic audit classification. The follow-up is fresh sequential native Architect then Critic review; this amendment does not authorize attempt 6.

## Frozen v2.6 Red contract

The then-active v2.6 test was `test/rjc-256-conformance.test.mjs`, SHA-256 `47c493dc5da3de94148bde48dbb90946c1c2ad28472e743ff9955c910b381768`, Git blob `5913b64b5b367b0b5c94494d5778aa479508a903`. Its named canonical vector is exactly V201–V260. V253 read-verifies the immutable v2.5 archive; V254–V255 bind the attempt-6 lifecycle and representative Green; V256–V257 bind pnpm audit classification and representative clean/findings Greens; V258–V259 reject lifecycle and audit mutations; V260 requires iteration/review cycle 7, phase `ralplan`, incomplete consensus, and attempt 6 unauthorized/unstarted.

The genuine v2.6 Red metadata, sanitized transcript, active run index, and evidence manifest are frozen at:

- `docs/evidence/rjc-256/red-v2-6-run.json` (`f2b7717d230d3b7e4a87b36d3af51bef842831de092385fb042cce87e8a2f803`);
- `docs/evidence/rjc-256/transcripts/red-v2-6-conformance.log` (`20ce01afa2d2a0c0446a6da7189bc5710a3d60a16d15904b8e25e80721a7e403`);
- `docs/evidence/rjc-256/test-runs.json` (`1f4eb278ca7d682d12ffbced09a91c152b94db3888e850da216a988ed6560e79`);
- `docs/evidence/rjc-256/v2-6-evidence.sha256` (`60b186de3aa3d87be3c91b7f5eba5971072d84b5d1b42d807206b0c87336dcd3`).

The expected Red has the 13 already-missing downstream/Linear cases plus V254 and V256 because no attempt-6 lifecycle or audit capture exists. Archive, representative-boundary, mutation, and state cases must pass. There is no v2.6 Green.

## Why iteration 8 reopened

The subsequent native cycle-6 Architect reviewed amendment SHA-256 `20aac081dcfc09a0314a3a1d66ceeb103101d969636b1e055e6338cb5e535a31` and returned `REVISE` at `2026-08-01T03:45:38Z`. That verdict is immutable prior history in `.omx/plans/rjc-256-peer-compatibility-architect-review-cycle6.md`, SHA-256 `e8da88919dec04efc689cfd84c5c3c16f1cb30acd907130d7267dcecf514b322`. It found three bounded gaps: incomplete pre-start inspect validation, duplicated/non-fail-fast audit classification, and incomplete transitive binding of lifecycle/audit/command/stderr/lock leaves. Critic was not started because Architect did not approve.

Before changing the active test, the complete v2.6 lineage was archived byte-identically under `docs/evidence/rjc-256/superseded/v2.6/`:

- test SHA-256 `47c493dc5da3de94148bde48dbb90946c1c2ad28472e743ff9955c910b381768`, Git blob `5913b64b5b367b0b5c94494d5778aa479508a903`;
- original Red metadata SHA-256 `f2b7717d230d3b7e4a87b36d3af51bef842831de092385fb042cce87e8a2f803`;
- original sanitized transcript SHA-256 `20ce01afa2d2a0c0446a6da7189bc5710a3d60a16d15904b8e25e80721a7e403`;
- archived run-index SHA-256 `1f4eb278ca7d682d12ffbced09a91c152b94db3888e850da216a988ed6560e79`;
- archived evidence-manifest SHA-256 `60b186de3aa3d87be3c91b7f5eba5971072d84b5d1b42d807206b0c87336dcd3`;
- supersession SHA-256 `6bfc9609ef93ba22128e09d6a7831df7fc4b3cdb13bf31dcbf2d9d816f8dc0a7`.

`supersession.json` states `superseded_without_green`, preserves the cycle-6 Architect `REVISE`, names v2.7 as successor, and keeps `attempt_6_authorized:false` / `attempt_6_started:false`.

## RALPLAN-DR iteration-8 decision

Principles remain immutability, observed isolation, exact shell-free argv, operational-error separation, and terminal-stop discipline. The three decision drivers are the cycle-6 findings above.

Options considered:

- **A — selected:** make one shared, pinned classifier the only audit authority in runtime and tests; validate every retained Docker isolation field before start; require all lifecycle/audit/command/stderr/lock leaves in the leaf-only checksum graph and both spike hash maps.
- **B — rejected:** patch runtime only. It leaves the frozen conformance and provenance gaps open.
- **C — rejected:** patch tests only. It leaves production capable of running full audit after terminal production classification.
- **D — invalid:** relax inspect or checksum assertions. It conceals the exact evidence gaps identified by Architect.

ADR: adopt Option A as a bounded v2.7 planning delta. It does not change dependency choices, the child snapshot, canonical lock argv, attempt count, external workflow, or RJC-257 boundary.

## Frozen v2.7 Red contract

The active test is `test/rjc-256-conformance.test.mjs`, SHA-256 `9865d1ac8d8a30463b669be81d7f992665ab312f69f4831ee44fa2f90e3b2862`, Git blob `bafc13ae5d6ca748b01255a74b8e3f1b7099449c`. Its canonical vector is exactly V201–V268. V261 read-verifies the v2.6 archive; V262 proves the active test imports the single shared classifier and contains no inline classifier; V263–V264 require complete runtime cross-binding and dual-map leaf provenance; V265 proves production terminal failure prevents full audit acquisition; V266 is the representative Green; V267 rejects 24 inspect/path/hash/command/classifier/report/provenance mutations; V268 requires iteration/review 8, phase `ralplan`, incomplete consensus, null current Architect/Critic reviews, and attempt 6 unauthorized/unstarted.

The genuine sanitized v2.7 Red is frozen at:

- metadata `docs/evidence/rjc-256/red-v2-7-run.json`, SHA-256 `9853ca2809c1b2c3e59d895fc52b37264cf96c2b646b21947c884814e497528e`;
- transcript `docs/evidence/rjc-256/transcripts/red-v2-7-conformance.log`, SHA-256 `ce0ad0562259903a1eb60bbc576b8b4bae25a2dab8b83f90ff3deb86c7652304`;
- active run index `docs/evidence/rjc-256/test-runs.json`, SHA-256 `30e5f76fbda069ec14bd8d4b87023df35f9e50efcb1afc1fc505331e95af97ca`;
- evidence manifest `docs/evidence/rjc-256/v2-7-evidence.sha256`, SHA-256 `f1ad57c040b34c53581387919d9ad9dc1c595adc9c9501a3dd8bd0c423e32d05`.

The run has 84 tests: 67 pass, 17 expected Red failures, 0 skipped. The 17 failures are the prior 15 missing downstream/attempt outputs plus V263 and V264; V261, V262, and V265–V268 pass. There is no v2.7 Green.

## Attempt-6 lifecycle protocol

The draft runners are `.omx/scripts/rjc-256-g003b-attempt6.sh`, `.omx/scripts/rjc-256-g003b-attempt6-preflight.sh`, and `.omx/scripts/rjc-256-g003b-attempt6-post-lock.sh`. They are planning inputs only. Before any later execution, the final amendment hash and fresh sequential approvals must be bound into state and the host runner.

Attempt 6 must use a fresh container name and preserve the exact image, `linux/arm64` platform, user `1000:1000`, no mounts, all capabilities dropped, `no-new-privileges`, bridge acquisition network, four CPUs, six GiB memory, and 512-PID limit. `docker create` must set `--workdir /home/node`, never the target workspace. Before start, `docker inspect` and `docker image inspect` must prove exact image digest, Linux/arm64, UID/GID `1000:1000`, `.Config.WorkingDir == "/home/node"`, empty mounts, `CapDrop == ["ALL"]`, `no-new-privileges:true`, bridge networking, `NanoCpus == 4000000000`, memory `6442450944`, and PID limit `512`. Normalize only those verified non-secret fields into `captures/acquisition-inspect.json`, hash it, copy it into the stopped container, then read-verify it in-process. Host-staged input permissions must be fixed before `docker cp`.

Before clone, the in-container preflight must prove `pwd -P == /home/node`, `/home/node` exists as a directory, and `/home/node/work/upstream` does not exist. Record those observed facts in `acquisition-process.json`. Clone and detach commit `10b5d4b0623123737854a3cb02d54f6e32a1fb9e`; only then may the host invoke exactly one direct:

```text
docker exec --user 1000:1000 \
  --workdir /home/node/work/upstream \
  <attempt-6-container> \
  /usr/bin/timeout --signal=TERM --kill-after=30s 1800s \
  /usr/local/bin/node --max-old-space-size=4096 \
  /usr/local/lib/node_modules/corepack/dist/corepack.js \
  pnpm install --lockfile-only --ignore-scripts --network-concurrency=1 \
  --fetch-retries=5 --fetch-retry-factor=2 \
  --fetch-retry-mintimeout=60000 --fetch-retry-maxtimeout=300000 \
  --config.engine-strict=true --config.strict-peer-dependencies=true
```

`--workdir` is Docker-exec metadata and must never enter the child argv. Store it separately with checkout SHA, `workspace_exists_before_lock:true`, exact unchanged `canonical_argv`, `mode:docker_exec_direct`, `shell_wrapper:false`, and invocation count 1. No `/bin/sh -c`, `/bin/bash -c`, `cd`, `env`, or other wrapper may surround the lock argv.

## Deterministic pnpm 11.18.0 audit contract

The decision is pinned to pnpm v11.18.0 source commit `925c33d78009b81503058d1c1f5a8c2978175ed2` and the official v11 documentation:

- `https://pnpm.io/11.x/cli/audit`;
- `https://github.com/pnpm/pnpm/blob/925c33d78009b81503058d1c1f5a8c2978175ed2/pnpm11/deps/compliance/commands/src/audit/audit.ts#L322-L353`;
- `https://github.com/pnpm/pnpm/blob/925c33d78009b81503058d1c1f5a8c2978175ed2/pnpm11/deps/compliance/audit/src/types.ts#L1-L55`;
- `https://github.com/pnpm/pnpm/blob/925c33d78009b81503058d1c1f5a8c2978175ed2/pnpm11/deps/compliance/audit/src/index.ts#L61-L129`.

Run production and full commands independently with explicit `--audit-level=low`, exact verified Node/Corepack paths, and no `--ignore-registry-errors`, `--fix`, `--ignore`, or `--ignore-unfixable`. Capture stdout JSON, stderr, timestamps, exit code, exact argv, effective child snapshot ID, and lock SHA separately for each command.

Exactly one classifier implementation is permitted: `.omx/scripts/rjc-256-pnpm-audit-classifier.mjs`, SHA-256 `b5659f5a632658088a04a64149475aacc837201cee85e8646820c6c23a198872`, pinned to pnpm `11.18.0` source commit `925c33d78009b81503058d1c1f5a8c2978175ed2`. The runtime copies and hash-verifies this module; the conformance test imports the same file. No inline production or test classifier may remain.

Production audit runs first. Write `captures/audit-production-command.json`, then immediately invoke the shared classifier. Any non-zero classifier exit is a terminal stop and the full audit command, raw output, stderr, and command evidence must not exist. Only a valid production classification permits the full audit. Full audit then receives its own raw JSON, stderr, command object, and shared-classifier result. `captures/audit-classifier.json` binds classifier bytes and both result captures; `captures/audit-classification.json` binds both command objects, classifications, exits, and classifier capture.

The only accepted classifications are:

- exit 0 plus a valid report and empty filtered `advisories` → `clean_report` at the low threshold;
- exit 1 plus a valid report and non-empty filtered `advisories` → `vulnerability_report`;
- every other exit, malformed/non-JSON/error-shaped output, missing/unknown keys, invalid values, or exit/report inconsistency → terminal `operational_error` and immediate stop.

A normal report has exactly top-level `advisories` and `metadata`. Metadata has exactly `vulnerabilities`, `dependencies`, `devDependencies`, `optionalDependencies`, and `totalDependencies`; vulnerability counts have exactly `info`, `low`, `moderate`, `high`, and `critical`. Normal output has no `auditReportVersion`. Metadata may include counts below the filtered threshold when exit is 0, so describe that result only as clean at threshold, never globally vulnerability-free. Valid findings are successful audit acquisition and flow to `security-advisories.json`; applicable high/critical findings still require owner, disposition, and follow-up, and an applicable unmitigated critical remains a closure blocker.

## Mandatory stop rules

Stop and return to RALPLAN if any of these occur:

- any strict peer error remains or a new peer conflict appears;
- pnpm mutates a declaration beyond the 44-row effective set;
- a source, config, script, or feature migration is required;
- the lock command exhausts retries, reaches the watchdog, or OOMs;
- fetch, offline frozen install, API build, Next.js 16 build, lint, typecheck, import smoke, or Jest/SWC smoke fails;
- lock bytes change after fetch or offline install;
- audit acquisition is an `operational_error`, including malformed/error-shaped JSON or an exit/report mismatch;
- sandbox, no-mount, env, capability, UID, resource, or offline-network evidence fails;
- evidence sanitization or checksums fail.

Do not repair or retry attempt 6 automatically after a terminal failure. Preserve evidence and return to consensus planning.

## Required v2.7 transitive evidence graph

The future leaf-only `SHA256SUMS` must not list itself or `spike.json`. It must read-verify every required retained leaf, including:

- `captures/acquisition-inspect.json`, `captures/acquisition-process.json`, `captures/checkout.json`, `captures/attempt6-container-lifecycle.json`, and `captures/lock-process.json`;
- production and full raw audit JSON, audit stderr, command JSON, shared-classifier result JSON, and classifier stderr;
- `captures/rjc-256-pnpm-audit-classifier.mjs`, `captures/audit-classifier.json`, and `captures/audit-classification.json`.

Every listed leaf must have the same exact SHA-256 in both `spike.artifact_hashes` and `spike.leaf_digests`. Cross-validation must bind inspect to process and lifecycle; checkout and lock-process to lifecycle; effective child snapshot and lock SHA across lock/audit commands; classifier SHA across captured bytes, lifecycle, commands, classifier metadata, and final classification; and raw stdout/stderr hashes to their command evidence. Production and full scopes, paths, argv, and captures must remain distinct.

## Downstream ordering

The child-bound v2.7 Red lineage exists and is frozen before attempt 6. G003b remains incomplete until attempt 6 passes every acquisition, offline, build, smoke, audit-capture, and evidence-integrity gate.

Only after G003b passes:

1. G004 posts and reads back the owner-authored Linear confirmation through Ryan's identity.
2. G005 materializes attempt-6 and Linear outputs against the already frozen v2.7 test and child snapshot, preserving all v1/v2/v2.1/v2.2/v2.3/v2.4/v2.5/v2.6/v2.7 Red/test hashes.
3. First v2.7 Green, provenance verification, independent code review, and UltraQA follow in the existing order.

No Linear issue transition occurs before all local and external gates pass.

## Review questions

Architect must decide whether the complete pre-start inspect validation, neutral working-directory lifecycle, direct post-clone Docker exec, one shared production-first fail-fast audit classifier, transitive dual-map leaf graph, immutable prior lineages, and frozen child-bound v2.7 Red preserve the RJC-256/RJC-257 architecture boundary.

Critic must decide whether lifecycle evidence proves every retained isolation and ordering fact, the child argv remains exact and shell-free, terminal production classification forbids full audit, all required leaves are independently read-verified and dual-map bound, pnpm findings cannot be confused with operational failure, and every failure returns to RALPLAN without self-certification.

## Iteration-9 v2.8 repair: content-addressed authorization before Docker

The cycle-7 native Architect `APPROVE` at sequence 1 and the subsequent cycle-5 native Critic `REVISE` at sequence 2 are immutable prior history. Their artifact hashes are respectively `691bd2441d12cb835366881b56e2b7b4c4e5707c46d1a047ec4afd4f0ea5f31e` and `82270d1a8a8ab4ce2968a0ac35ac235d20e3350ff270cef045c29bfab3844f98`; both reviewed amendment SHA-256 `c7bdb431b03f9892ad3c01577543c460b7b4380b720c397e6f258f3333f46591`. Attempt 6 remained unauthorized and unstarted.

Before the active test changed, v2.7 was archived byte-identically under `docs/evidence/rjc-256/superseded/v2.7/`. The archived test SHA-256 is `9865d1ac8d8a30463b669be81d7f992665ab312f69f4831ee44fa2f90e3b2862` and Git blob is `bafc13ae5d6ca748b01255a74b8e3f1b7099449c`; archived run index SHA-256 is `30e5f76fbda069ec14bd8d4b87023df35f9e50efcb1afc1fc505331e95af97ca`; archived evidence-manifest SHA-256 is `f1ad57c040b34c53581387919d9ad9dc1c595adc9c9501a3dd8bd0c423e32d05`. The original v2.7 Red metadata and transcript remain at their original paths and hashes. `supersession.json` records `superseded_without_green`, both sequential reviews, successor v2.8, and false attempt-6 flags.

The v2.8 execution program is frozen at these exact paths and bytes:

- host runner `.omx/scripts/rjc-256-g003b-attempt6.sh`, SHA-256 `fbe45b3f2545426a07810117aad55000cd33f07914aefb8029bb8cef430eb427`;
- preflight `.omx/scripts/rjc-256-g003b-attempt6-preflight.sh`, SHA-256 `e4ee2d251233ba1e084091aff6438bd0617d8d1c21bea2ec2ce2212c2bef1b3c`;
- post-lock `.omx/scripts/rjc-256-g003b-attempt6-post-lock.sh`, SHA-256 `1e901b4dbe4ebe1e4816e8458513bfab150b4f7137b4acfb0c062f999d5d32dc`;
- shared classifier `.omx/scripts/rjc-256-pnpm-audit-classifier.mjs`, SHA-256 `b5659f5a632658088a04a64149475aacc837201cee85e8646820c6c23a198872`;
- consensus helper `.omx/scripts/rjc-256-attempt6-consensus-gate.mjs`, SHA-256 `1721d850fedd0288da8f1b5dcc80ec7a96ecbf7aedaefe6f3612e34b3545bcba`.

There is no amendment/runner hash cycle. The runner contains no expected amendment digest. Immediately before its first Docker command it invokes the frozen helper, which hashes the actual amendment and requires the state execution manifest to match that actual digest. It also hashes every execution-program file and both review artifacts. Only an exact native Architect `APPROVE` at sequence 1 followed later by an exact native Critic `APPROVE` at sequence 2 can pass. Both records must use session `019fb9a7-bd5b-7eb2-b3e2-14f71fa22d15`, provenance `native_subagent`, tracker `.omx/state/subagent-tracking.json`, the exact `/root/rjc256_rate_limit_architect` and `/root/rjc256_rate_limit_critic` thread/lane identities, exact cycle-8/cycle-6 artifact paths, fresh completion timestamps after amendment finalization, actual artifact SHA-256 values, and the actual amendment SHA-256. The aliases must be byte-equivalent JSON values. Iteration and review cycle must both be 9, consensus must be complete, authorization must be true, and the one-shot started reservation must already be true.

Until that future sequence completes, current Architect and Critic records are null, consensus is incomplete, and attempt 6 is unauthorized and unstarted. The runner therefore exits before `docker container inspect` or `docker create`. No self-certification or boolean-only bypass is accepted.

The stopped-container input phase copies and re-hashes the host runner, preflight, post-lock, shared classifier, and consensus helper before clone or lock acquisition. Their captured bytes are mandatory future leaves at `captures/rjc-256-g003b-attempt6.sh`, `captures/rjc-256-g003b-attempt6-preflight.sh`, `captures/rjc-256-g003b-attempt6-post-lock.sh`, `captures/rjc-256-pnpm-audit-classifier.mjs`, and `captures/rjc-256-attempt6-consensus-gate.mjs`. Each must appear with the same digest in future leaf-only `SHA256SUMS`, `spike.artifact_hashes`, and `spike.leaf_digests`.

The active v2.8 conformance vector extends v2.7 with archive readback, a representative complete native consensus Green, adversarial review/program/amendment drift, explicit pre-Docker refusal, execution-leaf provenance, and iteration-9 null-current Red state. The active test SHA-256 is `80586196a3993f904b33a4a4e3d97e9b3286e4e01f531793d0a0b15c7cf12867`, Git blob `12aa7e9f201c51093a7d17dd20606bc5b59d0da9`, and canonical vector V201-V274. Its genuine sanitized Red has 90 tests, 73 passed, the same 17 expected missing-output failures, 0 skipped, and no structural v2.8 failure. Red metadata is `docs/evidence/rjc-256/red-v2-8-run.json`; transcript SHA-256 is `cf585fcaf31eed3933a427d85ff9eb2d8abb9c2c951f31490fe03bcd30558019`. No attempt-6, Docker, network, registry, Linear, or RJC-257 action is authorized by this repair.

## Iteration-10 v2.9 repair: amendment-bound execution-program manifest

The cycle-8 native Architect `REVISE` at sequence 1 is preserved at `.omx/plans/rjc-256-peer-compatibility-architect-review-cycle8.md`, SHA-256 `131b1d729bf311f612267ef0b0202368e63bc82f51822cc03aeb52d50088b88e`. It reviewed v2.8 amendment SHA-256 `0ebb8fdb89c2f5cdb02e763e112eadcea67f31f7d21b4fe0be091ed09c7cb1f4` and found that coordinated mutation of an execution-program leaf plus its mutable state hash could bypass the nominal content-addressing check. Attempt 6 remained unauthorized and unstarted.

Before successor edits, v2.8 was archived byte-identically under `docs/evidence/rjc-256/superseded/v2.8/` with status `superseded_without_green`. The archived test SHA-256 is `80586196a3993f904b33a4a4e3d97e9b3286e4e01f531793d0a0b15c7cf12867`, Git blob `12aa7e9f201c51093a7d17dd20606bc5b59d0da9`, archived run-index SHA-256 `d17d3a9d20b4a139683f2ab39ff19a6118265fe45c66d58612d194c82cd1dfd6`, and archived evidence-manifest SHA-256 `f0882d4730f1b65f6fc58dbb15926f60caf7b899342ab3f48397da613a45b675`. Its original Red metadata and transcript remain at their original paths and hashes. The pre-transition active state SHA-256 was `69bd210f7786d094349a568b5ab0c92702380c02e20bed2ebf6e75fbb437260a`.

The following block is the one canonical machine-readable execution-program manifest. The begin marker, compact JSON payload, and end marker each occur exactly once. The JSON has exactly three ordered top-level keys: `schema_version`, `paths`, and `sha256`. Both nested maps have exactly the five ordered keys shown. The payload contains no amendment digest, so amendment finalization remains acyclic and its actual SHA-256 is calculated dynamically.

<!-- RJC-256-EXECUTION-PROGRAM-MANIFEST-BEGIN -->
{"schema_version":1,"paths":{"runner":".omx/scripts/rjc-256-g003b-attempt6.sh","preflight":".omx/scripts/rjc-256-g003b-attempt6-preflight.sh","post_lock":".omx/scripts/rjc-256-g003b-attempt6-post-lock.sh","classifier":".omx/scripts/rjc-256-pnpm-audit-classifier.mjs","consensus_helper":".omx/scripts/rjc-256-attempt6-consensus-gate.mjs"},"sha256":{"runner":"fbe45b3f2545426a07810117aad55000cd33f07914aefb8029bb8cef430eb427","preflight":"e4ee2d251233ba1e084091aff6438bd0617d8d1c21bea2ec2ce2212c2bef1b3c","post_lock":"1e901b4dbe4ebe1e4816e8458513bfab150b4f7137b4acfb0c062f999d5d32dc","classifier":"b5659f5a632658088a04a64149475aacc837201cee85e8646820c6c23a198872","consensus_helper":"4ba8fa6177acb82bd39ad3874c59c64675f1ff654ae7021b69bf994ee0f1bd21"}}
<!-- RJC-256-EXECUTION-PROGRAM-MANIFEST-END -->

Before any review validation, the consensus helper reads the actual amendment bytes and accepts only that exact canonical payload. Missing, malformed, reordered, duplicated, extra, or altered markers, keys, structure, paths, or values reject. Canonical byte equality after JSON parsing rejects duplicate JSON keys as well as whitespace or serialization variants. Each of the five amendment-manifest hashes must equal both the actual leaf SHA-256 and the corresponding `state.execution_program.sha256` value. The amendment itself remains bound separately and dynamically: its actual SHA-256 must equal both state amendment hash fields and both future reviews' `reviewed_amendment_sha256`; the helper contains no amendment hash.

The v2.9 conformance vector retains every v2.8 control and adds byte-identical v2.8 archive readback, paired actual-leaf/state-hash co-mutations for all five program leaves, and manifest marker/JSON/schema/key/path/hash mutations. All such mutations must reject before review acceptance or Docker. Iteration and review cycle are 10. The cycle-8 REVISE artifact is prior history and cannot satisfy the fresh gate. Until a fresh native Architect `APPROVE` sequence 1 at `.omx/plans/rjc-256-peer-compatibility-architect-review-cycle9.md` and later native Critic `APPROVE` sequence 2 at `.omx/plans/rjc-256-peer-compatibility-critic-review-cycle6.md` both review the finalized actual amendment, current reviews are null, consensus is incomplete, and attempt 6 is unauthorized and unstarted. No attempt-6, Docker, network, registry, Linear, or RJC-257 action is authorized by this repair.
