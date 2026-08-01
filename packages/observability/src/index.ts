import type {
  AuditReceipt,
  ExecutionAuditReceipt,
  JsonValue,
} from "@sammys/contracts";

const SENSITIVE_KEY =
  /authorization|cookie|credential|password|private.?key|secret|token/iu;
const REDACTED = "[REDACTED]";

export const redactSensitiveValues = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValues);
  }
  if (value !== null && typeof value === "object") {
    const redacted: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      redacted[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : redactSensitiveValues(child);
    }
    return redacted;
  }
  return value;
};

export interface AuditSink {
  append: (receipt: AuditReceipt | ExecutionAuditReceipt) => Promise<void>;
}

export class InMemoryAuditSink implements AuditSink {
  readonly #receipts: (AuditReceipt | ExecutionAuditReceipt)[] = [];

  append = (receipt: AuditReceipt | ExecutionAuditReceipt): Promise<void> => {
    this.#receipts.push(Object.freeze({ ...receipt }));
    return Promise.resolve();
  };

  readAll(): readonly (AuditReceipt | ExecutionAuditReceipt)[] {
    return this.#receipts.map((receipt) => ({ ...receipt }));
  }
}
