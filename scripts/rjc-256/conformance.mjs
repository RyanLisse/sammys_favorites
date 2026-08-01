import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");

export const readJson = async (path) =>
  JSON.parse(await readFile(join(root, path), "utf8"));

export const trackedFiles = async () => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    }
  );
  return stdout.split("\0").filter(Boolean);
};

export const packageManifests = async () => {
  const tracked = await trackedFiles();
  const files = tracked.filter((path) => path.endsWith("package.json"));
  return Promise.all(
    files.map(async (path) => ({ path, manifest: await readJson(path) }))
  );
};

export const repositoryFiles = trackedFiles;

const historicalEvidence = "docs/evidence/rjc-256/";
const decisionPath =
  "docs/decisions/0001-upstream-baseline-and-direct-use-risk.md";
const conformancePaths = [
  "scripts/rjc-256/",
  "test/rjc-256-conformance.test.mjs",
];

export const productionFiles = async () => {
  const tracked = await trackedFiles();
  return tracked.filter(
    (path) =>
      !path.startsWith(historicalEvidence) &&
      path !== decisionPath &&
      !conformancePaths.some((allowedPath) => path.startsWith(allowedPath))
  );
};

export const scanProductionProvenance = async () => {
  const forbidden = [
    {
      label: "historical repository identity",
      pattern: /306-Technologies|306-starter-monorepo/u,
    },
    {
      label: "historical pinned revision",
      pattern: /10b5d4b0623123737854a3cb02d54f6e32a1fb9e/u,
    },
    { label: "historical package scope", pattern: /@starter\//u },
  ];
  const findings = [];

  for (const path of await productionFiles()) {
    let contents;
    try {
      contents = await readFile(join(root, path), "utf8");
    } catch {
      continue;
    }
    for (const rule of forbidden) {
      if (rule.pattern.test(contents)) {
        findings.push({ path, rule: rule.label });
      }
    }
  }

  return findings;
};

export const rootDirectory = root;
