import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/.medusa/**",
    ".next/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "docs/evidence/**",
    "out/**",
    "public/generated/**",
  ],
  rules: {
    "no-await-in-loop": "off",
  },
});
