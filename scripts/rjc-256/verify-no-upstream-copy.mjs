import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const upstreamRoot = process.argv[2] ? resolve(process.argv[2]) : undefined;

if (!upstreamRoot) {
  throw new Error(
    "Usage: node scripts/rjc-256/verify-no-upstream-copy.mjs <upstream-checkout>"
  );
}

const productionRoots = [
  ".npmrc",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "apps/",
  "packages/typescript-config/",
];
const textExtensions = new Set([
  "",
  ".css",
  ".js",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const repositoryFiles = async (root, includeUntracked = false) => {
  const arguments_ = ["-C", root, "ls-files", "-z", "--cached"];
  if (includeUntracked) {
    arguments_.push("--others", "--exclude-standard");
  }
  const { stdout } = await execFileAsync("git", arguments_);
  const paths = stdout.split("\0").filter(Boolean);
  const existingPaths = [];
  for (const path of paths) {
    try {
      await access(resolve(root, path));
      existingPaths.push(path);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return existingPaths;
};

const isProductionFile = (path) =>
  productionRoots.some((root) =>
    root.endsWith("/") ? path.startsWith(root) : path === root
  );

const normalizedLines = (content) =>
  new Set(
    content
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

const digest = (content) => createHash("sha256").update(content).digest("hex");
const repositoryPaths = await repositoryFiles(repositoryRoot, true);
const currentPaths = repositoryPaths.filter(isProductionFile);
const upstreamPaths = await repositoryFiles(upstreamRoot);
const upstreamRecords = [];

for (const path of upstreamPaths) {
  if (!textExtensions.has(extname(path))) {
    continue;
  }
  const content = await readFile(resolve(upstreamRoot, path), "utf8");
  upstreamRecords.push({
    content,
    hash: digest(content),
    lines: normalizedLines(content),
    path,
  });
}

const exactMatches = [];
const highSimilarityMatches = [];

for (const path of currentPaths) {
  if (!textExtensions.has(extname(path))) {
    continue;
  }
  const content = await readFile(resolve(repositoryRoot, path), "utf8");
  const hash = digest(content);
  const lines = normalizedLines(content);

  for (const upstream of upstreamRecords) {
    if (hash === upstream.hash) {
      exactMatches.push({
        currentPath: path,
        sha256: hash,
        upstreamPath: upstream.path,
      });
      continue;
    }
    if (lines.size < 5 || upstream.lines.size < 5) {
      continue;
    }
    const score = jaccard(lines, upstream.lines);
    if (score >= 0.8) {
      highSimilarityMatches.push({
        currentPath: path,
        score: Number(score.toFixed(4)),
        upstreamPath: upstream.path,
      });
    }
  }
}

const report = {
  schemaVersion: 1,
  comparison: "sha256 exact match and normalized-line Jaccard >= 0.8",
  currentFileCount: currentPaths.length,
  upstreamFileCount: upstreamPaths.length,
  exactMatches,
  highSimilarityMatches,
  passed: exactMatches.length === 0 && highSimilarityMatches.length === 0,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) {
  process.exitCode = 1;
}
