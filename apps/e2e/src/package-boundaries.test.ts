import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const workspaceRoots = ["apps", "packages"] as const;
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const protectedApplicationDirectories = ["agent-worker", "atelier"] as const;
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

interface Manifest {
  name?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface WorkspaceManifest {
  directoryName: string;
  kind: (typeof workspaceRoots)[number];
  manifest: Manifest;
  manifestPath: string;
}

const discoverWorkspaceManifests = async (): Promise<WorkspaceManifest[]> => {
  const discovered: WorkspaceManifest[] = [];

  for (const kind of workspaceRoots) {
    const kindRoot = path.join(repositoryRoot, kind);
    const directoryEntries = await readdir(kindRoot, { withFileTypes: true });

    for (const directoryEntry of directoryEntries) {
      if (!directoryEntry.isDirectory()) {
        continue;
      }

      const manifestPath = path.join(
        kindRoot,
        directoryEntry.name,
        "package.json"
      );
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8")
      ) as Manifest;
      discovered.push({
        directoryName: directoryEntry.name,
        kind,
        manifest,
        manifestPath,
      });
    }
  }

  return discovered;
};

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const sourceFiles: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      sourceFiles.push(...(await collectSourceFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      sourceFiles.push(entryPath);
    }
  }

  return sourceFiles;
};

test("every workspace manifest has the exact unique directory-derived name", async () => {
  const workspaces = await discoverWorkspaceManifests();
  const seenNames = new Set<string>();

  for (const workspace of workspaces) {
    const expectedName = `@sammys/${workspace.directoryName}`;
    assert.equal(workspace.manifest.name, expectedName, workspace.manifestPath);
    assert.equal(
      seenNames.has(expectedName),
      false,
      `Duplicate workspace name: ${expectedName}`
    );
    seenNames.add(expectedName);
  }
});

test("workspace dependencies never point into applications", async () => {
  const workspaces = await discoverWorkspaceManifests();
  const applicationNames = new Set(
    workspaces
      .filter((workspace) => workspace.kind === "apps")
      .map((workspace) => workspace.manifest.name)
      .filter((name): name is string => typeof name === "string")
  );

  for (const workspace of workspaces) {
    for (const section of dependencySections) {
      const dependencies = workspace.manifest[section] ?? {};

      for (const [dependencyName, dependencyVersion] of Object.entries(
        dependencies
      )) {
        const isWorkspaceDependency =
          dependencyVersion.startsWith("workspace:");
        assert.equal(
          isWorkspaceDependency && applicationNames.has(dependencyName),
          false,
          `${workspace.manifestPath} ${section}.${dependencyName} points into apps`
        );
      }
    }
  }
});

test("atelier and agent-worker have no provider or Medusa dependencies", async () => {
  const workspaces = await discoverWorkspaceManifests();

  for (const directoryName of protectedApplicationDirectories) {
    const workspace = workspaces.find(
      (candidate) =>
        candidate.kind === "apps" && candidate.directoryName === directoryName
    );
    assert.ok(workspace, `Missing apps/${directoryName}/package.json`);

    for (const section of dependencySections) {
      for (const dependencyName of Object.keys(
        workspace.manifest[section] ?? {}
      )) {
        assert.doesNotMatch(
          dependencyName,
          /(?:medusa|provider)/iu,
          `${workspace.manifestPath} ${section}.${dependencyName} crosses the boundary`
        );
      }
    }
  }
});

test("atelier and agent-worker contain no imports or re-exports", async () => {
  const forbiddenSyntax = [
    /(?:^|[;\n]\s*)import\s+(?:["'{*]|[\w$])/mu,
    /\bimport\s*\(/mu,
    /\brequire\s*\(/mu,
    /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']/mu,
  ];

  for (const directoryName of protectedApplicationDirectories) {
    const sourceRoot = path.join(repositoryRoot, "apps", directoryName, "src");
    const sourceFiles = await collectSourceFiles(sourceRoot);

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, "utf8");

      for (const forbiddenPattern of forbiddenSyntax) {
        assert.doesNotMatch(source, forbiddenPattern, sourceFile);
      }
    }
  }
});
