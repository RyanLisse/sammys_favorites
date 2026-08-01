import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const adrPath = path.join(
  repositoryRoot,
  "docs/decisions/0002-effect-adoption-boundary.md"
);
const architecturePath = path.join(repositoryRoot, "docs/architecture.md");

const readWorkspaceManifests = async (): Promise<
  readonly { readonly path: string; readonly source: string }[]
> => {
  const manifests: { path: string; source: string }[] = [];
  for (const workspaceDirectory of ["apps", "packages"] as const) {
    const entries = await readdir(
      path.join(repositoryRoot, workspaceDirectory),
      {
        withFileTypes: true,
      }
    );
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = path.join(
        repositoryRoot,
        workspaceDirectory,
        entry.name,
        "package.json"
      );
      try {
        manifests.push({
          path: path.relative(repositoryRoot, manifestPath),
          source: await readFile(manifestPath, "utf-8"),
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
  return manifests;
};

test("records the bounded Effect adoption decision and ownership", async () => {
  const [adr, architecture] = await Promise.all([
    readFile(adrPath, "utf-8"),
    readFile(architecturePath, "utf-8"),
  ]);

  for (const statement of [
    "Effect is not a repository-wide platform default",
    "Medusa remains the sole owner of durable commerce workflows",
    "RJC-258 remains the owner of shared Zod/OpenAPI contracts",
    "RJC-265 remains the owner of durable integration delivery",
    "Fastest-disproof criteria",
  ]) {
    assert.match(adr, new RegExp(statement, "u"), statement);
  }
  assert.match(adr, /\.\.\/architecture\.md/u);
  assert.match(architecture, /decisions\/0002-effect-adoption-boundary\.md/u);
  assert.match(architecture, /security\/threat-model\.md/u);
  assert.match(architecture, /plain TypeScript values and `Promise` results/u);
});

test("adds no direct Effect production dependency", async () => {
  const manifests = await readWorkspaceManifests();
  for (const manifest of manifests) {
    const parsed = JSON.parse(manifest.source) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly optionalDependencies?: Readonly<Record<string, string>>;
      readonly peerDependencies?: Readonly<Record<string, string>>;
    };
    const productionDependencies = {
      ...parsed.dependencies,
      ...parsed.optionalDependencies,
      ...parsed.peerDependencies,
    };
    const forbidden = Object.keys(productionDependencies).filter(
      (dependency) =>
        dependency === "effect" || dependency.startsWith("@effect/")
    );
    assert.deepEqual(forbidden, [], manifest.path);
  }
});
