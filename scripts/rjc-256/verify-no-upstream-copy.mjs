import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const pinnedUpstreamCommit = "10b5d4b0623123737854a3cb02d54f6e32a1fb9e";
const supersededScaffoldRef = "cf90192";
const generatedPaths = new Set([
  "apps/storefront/next-env.d.ts",
  "pnpm-lock.yaml",
]);
const immutableEvidencePrefix = "docs/evidence/";
const generatedSuffixes = [".tsbuildinfo"];
const textExtensions = new Set([
  "",
  ".css",
  ".graphql",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const git = async (root, arguments_, encoding = "utf-8") => {
  const { stdout } = await execFileAsync("git", ["-C", root, ...arguments_], {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
};

const resolveObject = async (root, revision) => {
  const object = await git(root, ["rev-parse", revision]);
  return object.trim();
};

const commitMetadata = async (root, revision) => {
  const commit = await resolveObject(root, `${revision}^{commit}`);
  const tree = await resolveObject(root, `${commit}^{tree}`);
  const committedAtOutput = await git(root, [
    "show",
    "-s",
    "--format=%cI",
    commit,
  ]);
  const committedAt = committedAtOutput.trim();
  return { commit, committedAt, tree };
};

const treePaths = async (root, commit) => {
  const output = await git(root, [
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    commit,
  ]);
  return output.split("\0").filter(Boolean).toSorted();
};

const readObject = (root, commit, objectPath) =>
  git(root, ["show", `${commit}:${objectPath}`], "buffer");

export const isActiveTrackedFile = (trackedPath) =>
  !trackedPath.startsWith(immutableEvidencePrefix) &&
  !generatedPaths.has(trackedPath) &&
  !generatedSuffixes.some((suffix) => trackedPath.endsWith(suffix));

const digest = (content) => createHash("sha256").update(content).digest("hex");

export const contentManifestSha256 = (records) => {
  const hash = createHash("sha256");
  const sortedRecords = records.toSorted((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))
  );
  for (const record of sortedRecords) {
    hash.update(record.path, "utf-8");
    hash.update("\0", "utf-8");
    hash.update(String(record.content.byteLength), "ascii");
    hash.update("\0", "utf-8");
    hash.update(record.content);
    hash.update("\0", "utf-8");
  }
  return hash.digest("hex");
};

const normalizedLines = (content) =>
  new Set(
    content
      .toString("utf-8")
      .split("\n")
      .map((line) => line.trim().replaceAll(/\s+/gu, " "))
      .filter(
        (line) =>
          line.length > 0 && !line.startsWith("//") && !line.startsWith("#")
      )
  );

const jaccard = (left, right) => {
  const intersection = [...left].filter((line) => right.has(line)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const recordsAt = async (root, commit, pathFilter = () => true) => {
  const allPaths = await treePaths(root, commit);
  const paths = allPaths.filter(pathFilter);
  return Promise.all(
    paths.map(async (objectPath) => {
      const content = await readObject(root, commit, objectPath);
      return {
        content,
        hash: digest(content),
        lines: textExtensions.has(path.extname(objectPath))
          ? normalizedLines(content)
          : undefined,
        path: objectPath,
      };
    })
  );
};

const compare = (currentRecords, sourceRecords, sourceKind) => {
  const exactMatches = [];
  const highSimilarityMatches = [];

  for (const current of currentRecords) {
    for (const source of sourceRecords) {
      if (current.hash === source.hash) {
        exactMatches.push({
          currentPath: current.path,
          sha256: current.hash,
          sourceKind,
          sourcePath: source.path,
        });
        continue;
      }
      if (
        !current.lines ||
        !source.lines ||
        current.lines.size < 5 ||
        source.lines.size < 5
      ) {
        continue;
      }
      const score = jaccard(current.lines, source.lines);
      if (score >= 0.8) {
        highSimilarityMatches.push({
          currentPath: current.path,
          score: Number(score.toFixed(4)),
          sourceKind,
          sourcePath: source.path,
        });
      }
    }
  }

  return { exactMatches, highSimilarityMatches };
};

const parseArguments = (arguments_) => {
  const [upstreamPath, ...options] = arguments_;
  if (!upstreamPath) {
    throw new Error(
      "Usage: node scripts/rjc-256/verify-no-upstream-copy.mjs <upstream-checkout> [--target <commit>]"
    );
  }
  let targetRef = "HEAD";
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] !== "--target" || !options[index + 1]) {
      throw new Error(`Unknown or incomplete option: ${options[index]}`);
    }
    targetRef = options[index + 1];
    index += 1;
  }
  return { targetRef, upstreamRoot: path.resolve(upstreamPath) };
};

export const createReport = async ({ targetRef, upstreamRoot }) => {
  const target = await commitMetadata(repositoryRoot, targetRef);
  const upstream = await commitMetadata(upstreamRoot, "HEAD");
  if (upstream.commit !== pinnedUpstreamCommit) {
    throw new Error(
      `Upstream checkout must be detached at ${pinnedUpstreamCommit}; received ${upstream.commit}`
    );
  }
  const superseded = await commitMetadata(
    repositoryRoot,
    supersededScaffoldRef
  );
  const targetRecords = await recordsAt(
    repositoryRoot,
    target.commit,
    isActiveTrackedFile
  );
  const upstreamRecords = await recordsAt(upstreamRoot, upstream.commit);
  const supersededRecords = await recordsAt(
    repositoryRoot,
    superseded.commit,
    isActiveTrackedFile
  );
  const upstreamComparison = compare(
    targetRecords,
    upstreamRecords,
    "pinned-upstream"
  );
  const supersededComparison = compare(
    targetRecords,
    supersededRecords,
    "superseded-scaffold"
  );
  const exactMatches = [
    ...upstreamComparison.exactMatches,
    ...supersededComparison.exactMatches,
  ];
  const highSimilarityMatches = [
    ...upstreamComparison.highSimilarityMatches,
    ...supersededComparison.highSimilarityMatches,
  ];

  return {
    comparison:
      "SHA-256 exact match for every active tracked file and normalized-line Jaccard >= 0.8 for text files",
    exact_matches: exactMatches,
    generated_at: new Date().toISOString(),
    high_similarity_matches: highSimilarityMatches,
    passed: exactMatches.length === 0 && highSimilarityMatches.length === 0,
    schema_version: 2,
    scope: {
      excluded: [
        "docs/evidence/** (immutable evidence and historical research)",
        "pnpm-lock.yaml (generated dependency resolution)",
        "apps/storefront/next-env.d.ts (framework generated)",
        "**/*.tsbuildinfo (compiler generated)",
      ],
      included: "all tracked files in the target tree",
    },
    similarity_threshold: 0.8,
    sources: [
      {
        commit: upstream.commit,
        file_count: upstreamRecords.length,
        kind: "pinned-upstream",
        repository: "https://github.com/306-Technologies/306-starter-monorepo",
        tree: upstream.tree,
      },
      {
        commit: superseded.commit,
        file_count: supersededRecords.length,
        kind: "superseded-scaffold",
        repository: "this repository",
        tree: superseded.tree,
      },
    ],
    target: {
      active_file_count: targetRecords.length,
      commit: target.commit,
      committed_at: target.committedAt,
      content_manifest_algorithm:
        "for each path sorted lexicographically: UTF-8 path, NUL, ASCII byte length, NUL, raw content, NUL",
      content_manifest_sha256: contentManifestSha256(targetRecords),
      tree: target.tree,
    },
  };
};

const main = async () => {
  const report = await createReport(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) {
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
