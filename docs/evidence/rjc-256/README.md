# RJC-256 evidence classification

The normative RJC-256 evidence is `baseline.json`, `version-matrix.json`,
`migration-map.json`, `official-source-readback.json`,
`scaffold-provenance.json`, `no-copy-report.json`, `reviews/`, and the current
`test-runs.json`.

All captures, failure records, red runs, old digests, resolution snapshots, and
`superseded/` lineages are retained only as historical research. They document
the abandoned direct-use investigation and are not build, dependency, codegen,
or runtime inputs. Their presence does not authorize reuse of the researched
repository.

## No-copy report

`scripts/rjc-256/verify-no-upstream-copy.mjs` compares every active tracked
file in an exact target Git tree with both the pinned 306 research checkout and
the superseded local scaffold. The only exclusions are immutable evidence and
generated dependency, framework, and compiler outputs. Exact SHA-256 matches
are checked for every file; normalized-line similarity is additionally checked
for text files.

The report binds the target commit and tree IDs and a SHA-256 content manifest.
That manifest hashes, in byte-sorted path order, each UTF-8 path, its raw byte
length, and its raw file content with NUL separators. Generate the final report
only after the target implementation commit exists:

```sh
node scripts/rjc-256/verify-no-upstream-copy.mjs \
  <pinned-upstream-checkout> --target <target-commit>
```

The command rejects an upstream checkout whose `HEAD` does not resolve to
`10b5d4b0623123737854a3cb02d54f6e32a1fb9e`. The resulting evidence commit may
follow the target commit; the report must not claim to cover its own later
evidence commit.

### Addendum 2026-08-30

`no-copy-report.json` was regenerated against `main` at
`182b21f09f0a297bf213fa5d528170649814b7d9` (PR #10 merged), superseding the
2026-08-01 run that targeted `f809076d9314aa971444d9f7a797c8cd71288a67`. The
pinned 306 research checkout is unchanged at
`10b5d4b0623123737854a3cb02d54f6e32a1fb9e`; the run passed with no exact and no
high-similarity matches across 119 active tracked files.

This regenerated report is the G1 checkout pointer for RJC-256 through RJC-260.
It records only the no-copy comparison at that commit. It is not a G1
completion signal, and it does not by itself satisfy any other G1 requirement.
