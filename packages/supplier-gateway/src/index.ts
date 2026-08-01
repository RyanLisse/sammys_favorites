import { CONTRACT_VERSION } from "@sammys/contracts";
import type {
  supplierQuoteSchema,
  supplierSkuSnapshotSchema,
} from "@sammys/contracts";
import { z } from "zod";

export const supplierSkuRefSchema = z
  .object({
    productId: z.string().min(1).max(128),
    sku: z.string().min(1).max(128),
    supplierId: z.string().min(1).max(128),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const supplierQuoteRequestSchema = supplierSkuRefSchema
  .unwrap()
  .extend({
    quantity: z.number().int().positive().max(10_000),
    requestedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .readonly();

export const supplierOrderRequestSchema = z
  .object({
    approvalNonce: z.string().min(16).max(256),
    proposalBindingSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    proposalId: z.uuid(),
    quantity: z.number().int().positive().max(10_000),
    quoteId: z.string().min(1).max(128),
    sku: z.string().min(1).max(128),
    supplierId: z.string().min(1).max(128),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export const supplierOrderReceiptSchema = z
  .object({
    orderId: z.string().min(1).max(128),
    status: z.enum(["accepted", "rejected"]),
    version: z.literal(CONTRACT_VERSION),
  })
  .strict()
  .readonly();

export type SupplierSkuRef = z.infer<typeof supplierSkuRefSchema>;
export type SupplierQuoteRequest = z.infer<typeof supplierQuoteRequestSchema>;
export type SupplierOrderRequest = z.infer<typeof supplierOrderRequestSchema>;
export type SupplierOrderReceipt = z.infer<typeof supplierOrderReceiptSchema>;

export interface SupplierReadPort {
  getSkuSnapshot: (
    reference: SupplierSkuRef
  ) => Promise<z.infer<typeof supplierSkuSnapshotSchema> | null>;
}

export interface SupplierQuotePort {
  requestQuote: (
    request: SupplierQuoteRequest
  ) => Promise<z.infer<typeof supplierQuoteSchema>>;
}

/** Privileged capability. Never hand this interface to an autonomous agent. */
export interface SupplierOrderWritePort {
  placeApprovedOrder: (
    request: SupplierOrderRequest
  ) => Promise<SupplierOrderReceipt>;
}
