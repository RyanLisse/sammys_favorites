import { createHmac, timingSafeEqual } from "node:crypto";

import type { Approval, JsonValue } from "@sammys/contracts";

import { canonicalizeJson } from "./canonical-json.js";

export interface ApprovalVerifier {
  verify: (approval: Approval) => Promise<boolean>;
}

const unsignedApproval = (approval: Approval): JsonValue => {
  const { signature: _signature, ...provenance } = approval.provenance;
  return { ...approval, provenance };
};

export class HmacApprovalVerifier implements ApprovalVerifier {
  readonly #keys: ReadonlyMap<string, Uint8Array>;

  constructor(keys: ReadonlyMap<string, Uint8Array>) {
    this.#keys = new Map(
      [...keys].map(([keyId, key]) => [keyId, new Uint8Array(key)])
    );
  }

  verify = (approval: Approval): Promise<boolean> => {
    const key = this.#keys.get(approval.provenance.keyId);
    if (!key) {
      return Promise.resolve(false);
    }
    const expected = createHmac("sha256", key)
      .update(canonicalizeJson(unsignedApproval(approval)), "utf-8")
      .digest();
    const supplied = Buffer.from(approval.provenance.signature, "hex");
    return Promise.resolve(
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  };
}

export const createApprovalSignature = (
  approval: Approval,
  key: Uint8Array
): string =>
  createHmac("sha256", key)
    .update(canonicalizeJson(unsignedApproval(approval)), "utf-8")
    .digest("hex");
