import { z } from "zod";

export const CONTRACT_VERSION = "v1" as const;
export const SUPPORTED_CURRENCIES = ["EUR", "GBP", "USD"] as const;

const identifierSchema = z.string().min(1).max(128);
const isoTimestampSchema = z.iso.datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema).readonly(),
    z.record(z.string(), jsonValueSchema).readonly(),
  ])
);

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze(Reflect.get(value, key));
    }
    Object.freeze(value);
  }
  return value;
};

export const moneySchema = z
  .object({
    amountMinor: z.number().int().nonnegative().safe(),
    currency: z.enum(SUPPORTED_CURRENCIES),
  })
  .strict()
  .readonly();

export const productSchema = z
  .object({
    handle: z.string().min(1).max(200),
    id: identifierSchema,
    status: z.enum(["draft", "active", "archived"]),
    title: z.string().min(1).max(300),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const cartLineSchema = z
  .object({
    productId: identifierSchema,
    quantity: z.number().int().positive().max(100),
    sku: identifierSchema,
    unitPrice: moneySchema,
  })
  .strict()
  .readonly();

export const cartSchema = z
  .object({
    id: identifierSchema,
    lines: z.array(cartLineSchema).max(100).readonly(),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const supplierSkuSnapshotSchema = z
  .object({
    availableQuantity: z.number().int().nonnegative(),
    capturedAt: isoTimestampSchema,
    leadTimeDays: z.number().int().nonnegative().max(365),
    productId: identifierSchema,
    sku: identifierSchema,
    supplierId: identifierSchema,
    unitPrice: moneySchema,
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const supplierQuoteSchema = z
  .object({
    expiresAt: isoTimestampSchema,
    quantity: z.number().int().positive(),
    quoteId: identifierSchema,
    quotedAt: isoTimestampSchema,
    sku: identifierSchema,
    supplierId: identifierSchema,
    total: moneySchema,
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .refine((quote) => Date.parse(quote.expiresAt) > Date.parse(quote.quotedAt), {
    message: "expiresAt must be after quotedAt",
    path: ["expiresAt"],
  })
  .readonly();

export const qcEvidenceSchema = z
  .object({
    capturedAt: isoTimestampSchema,
    evidenceId: identifierSchema,
    inspectorId: identifierSchema,
    notes: z.string().max(2000).optional(),
    outcome: z.enum(["accepted", "rejected", "needs-review"]),
    productId: identifierSchema,
    sha256: sha256Schema,
    sku: identifierSchema,
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const integrationMessageSchema = z
  .object({
    id: z.uuid(),
    occurredAt: isoTimestampSchema,
    payload: jsonValueSchema,
    source: identifierSchema,
    type: z.string().min(1).max(200),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const webhookReceiptSchema = z
  .object({
    eventId: identifierSchema,
    payloadSha256: sha256Schema,
    provider: identifierSchema,
    receivedAt: isoTimestampSchema,
    signatureVerified: z.boolean(),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const auditReceiptSchema = z
  .object({
    action: z.string().min(1).max(200),
    actorId: identifierSchema,
    decision: z.enum(["allowed", "denied"]),
    occurredAt: isoTimestampSchema,
    reasonCode: z.string().min(1).max(100),
    receiptId: z.uuid(),
    resourceId: identifierSchema.optional(),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const executionAuditReceiptSchema = z
  .object({
    actorId: identifierSchema,
    approvalId: z.uuid(),
    bindingSha256: sha256Schema,
    claimId: identifierSchema,
    decision: z.literal("allowed"),
    executionIntentId: identifierSchema,
    occurredAt: isoTimestampSchema,
    outboxMessageId: identifierSchema,
    reasonCode: z.literal("ALLOW"),
    resourceId: identifierSchema,
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const actionBindingSchema = z
  .object({
    actionType: z.string().min(1).max(200),
    capability: z.string().min(1).max(200),
    payload: jsonValueSchema,
    resource: z
      .object({
        id: identifierSchema,
        target: z.string().min(1).max(2048),
        type: z.string().min(1).max(100),
      })
      .strict()
      .readonly(),
    riskClass: z.enum(["low", "material", "high"]),
    stage: z.enum(["read", "draft", "propose", "approve", "execute"]),
  })
  .strict()
  .readonly();

export const proposalSchema = z
  .object({
    binding: actionBindingSchema,
    bindingSha256: sha256Schema,
    createdAt: isoTimestampSchema,
    createdBy: identifierSchema,
    expiresAt: isoTimestampSchema,
    id: z.uuid(),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .refine(
    (proposal) =>
      Date.parse(proposal.expiresAt) > Date.parse(proposal.createdAt),
    { message: "expiresAt must be after createdAt", path: ["expiresAt"] }
  )
  .transform(deepFreeze);

export const approvalSchema = z
  .object({
    actorId: identifierSchema,
    approvalId: z.uuid(),
    approvedAt: isoTimestampSchema,
    binding: actionBindingSchema,
    expiresAt: isoTimestampSchema,
    nonce: z.string().min(16).max(256),
    proposalBindingSha256: sha256Schema,
    proposalId: z.uuid(),
    proposalVersion: z.literal(CONTRACT_VERSION),
    provenance: z
      .object({
        issuer: identifierSchema,
        keyId: identifierSchema,
        signature: sha256Schema,
      })
      .strict()
      .readonly(),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .refine(
    (approval) =>
      Date.parse(approval.expiresAt) > Date.parse(approval.approvedAt),
    { message: "expiresAt must be after approvedAt", path: ["expiresAt"] }
  )
  .transform(deepFreeze);

export type ActionBinding = z.infer<typeof actionBindingSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type AuditReceipt = z.infer<typeof auditReceiptSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type ExecutionAuditReceipt = z.infer<typeof executionAuditReceiptSchema>;
export type IntegrationMessage = z.infer<typeof integrationMessageSchema>;
export type Money = z.infer<typeof moneySchema>;
export type Product = z.infer<typeof productSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type QcEvidence = z.infer<typeof qcEvidenceSchema>;
export type SupplierQuote = z.infer<typeof supplierQuoteSchema>;
export type SupplierSkuSnapshot = z.infer<typeof supplierSkuSnapshotSchema>;
export type WebhookReceipt = z.infer<typeof webhookReceiptSchema>;
