import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/node_modules/**",
    "**/.next/**",
    "**/.medusa/**",
    "**/dist/**",
    "docs/evidence/**",
    "test/rjc-256-conformance.test.mjs",
  ],
  rules: {
    "func-style": "off",
    "sort-keys": "off",
    "unicorn/text-encoding-identifier-case": "off",
    "unicorn/import-style": "off",
    "no-await-in-loop": "off",
    "require-unicode-regexp": "off",
    "unicorn/prefer-module": "off",
    "typescript/consistent-type-imports": "warn",
  },
});
