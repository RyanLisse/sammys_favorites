import { createHash } from "node:crypto";

import type { JsonValue } from "@sammys/contracts";

const assertWellFormedUnicode = (value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint >= 0xd8_00 && codePoint <= 0xdf_ff) {
      throw new TypeError(
        "Canonical JSON does not allow lone UTF-16 surrogates"
      );
    }
    if (codePoint > 0xff_ff) {
      index += 1;
    }
  }
};

const isJsonArray = (value: JsonValue): value is readonly JsonValue[] =>
  Array.isArray(value);

const canonicalizeValue = (value: JsonValue): string => {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not allow non-finite numbers");
    }
    return JSON.stringify(value);
  }

  if (isJsonArray(value)) {
    return `[${value.map(canonicalizeValue).join(",")}]`;
  }

  const properties = Object.keys(value)
    .toSorted()
    .map((key) => {
      assertWellFormedUnicode(key);
      return `${JSON.stringify(key)}:${canonicalizeValue(value[key] as JsonValue)}`;
    });
  return `{${properties.join(",")}}`;
};

/** Canonical JSON using the RFC 8785/JCS ECMAScript serialization rules. */
export const canonicalizeJson = (value: JsonValue): string =>
  canonicalizeValue(value);

export const sha256CanonicalJson = (value: JsonValue): string =>
  createHash("sha256").update(canonicalizeJson(value), "utf-8").digest("hex");
