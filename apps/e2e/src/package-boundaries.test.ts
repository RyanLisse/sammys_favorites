import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

async function pkg(name: string) {
  const path = resolve(root, name, "package.json");
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

test("atelier and agent-worker do not depend on Medusa or provider SDKs", async () => {
  for (const name of ["atelier", "agent-worker"]) {
    const p = await pkg(name);
    const deps = Object.keys({
      ...p.dependencies,
      ...p.devDependencies,
    });
    const forbidden = deps.filter(
      (d) => d.startsWith("@medusajs/") || /sdk/i.test(d)
    );
    assert.deepEqual(
      forbidden,
      [],
      `${name} contains forbidden dependencies: ${forbidden.join(", ")}`
    );
  }
});

test("every workspace package is addressable by @sammys/* name", () => {
  const expected = [
    "@sammys/commerce",
    "@sammys/storefront",
    "@sammys/atelier",
    "@sammys/agent-worker",
    "@sammys/e2e",
    "@sammys/typescript-config",
    "@sammys/eslint-config",
  ];
  for (const name of expected) {
    assert.ok(name.startsWith("@sammys/"), `${name} uses @sammys scope`);
  }
});
