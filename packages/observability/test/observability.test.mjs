import assert from "node:assert/strict";
import test from "node:test";

import { redactSensitiveValues } from "../dist/index.js";

test("recursively redacts likely credentials without mutating input", () => {
  const input = {
    nested: { authorization: "Bearer abc", safe: "visible" },
    token: "abc",
  };
  assert.deepEqual(redactSensitiveValues(input), {
    nested: { authorization: "[REDACTED]", safe: "visible" },
    token: "[REDACTED]",
  });
  assert.equal(input.token, "abc");
});
