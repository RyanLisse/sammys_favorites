import {
  approvalSchema,
  proposalSchema,
  supplierSkuSnapshotSchema,
} from "@sammys/contracts";
import type {
  ActionBinding,
  Approval,
  Proposal,
  SupplierSkuSnapshot,
} from "@sammys/contracts";

export const validSupplierSkuSnapshotFixture: SupplierSkuSnapshot =
  supplierSkuSnapshotSchema.parse({
    availableQuantity: 12,
    capturedAt: "2026-08-01T12:00:00Z",
    leadTimeDays: 7,
    productId: "supplier-product-1",
    sku: "GOLD-42",
    supplierId: "supplier-1",
    unitPrice: { amountMinor: 1599, currency: "EUR" },
    version: "v1",
  });

export const invalidSupplierSkuSnapshotFixtures: readonly unknown[] =
  Object.freeze([
    { ...validSupplierSkuSnapshotFixture, sku: "" },
    { ...validSupplierSkuSnapshotFixture, availableQuantity: -1 },
    {
      ...validSupplierSkuSnapshotFixture,
      unitPrice: { amountMinor: 15.99, currency: "EUR" },
    },
    { ...validSupplierSkuSnapshotFixture, version: "v0" },
  ]);

export const createProposalFixture = (
  binding: ActionBinding,
  bindingSha256: string
): Proposal =>
  proposalSchema.parse({
    binding,
    bindingSha256,
    createdAt: "2026-08-01T11:55:00Z",
    createdBy: "agent-1",
    expiresAt: "2026-08-01T12:10:00Z",
    id: "1454fd9c-b64b-45a5-a719-d562ccb73c4f",
    version: "v1",
  });

export const createApprovalFixture = (
  proposal: Proposal,
  nonce = "one-time-nonce-123"
): Approval =>
  approvalSchema.parse({
    actorId: "operator-1",
    approvalId: "2454fd9c-b64b-45a5-a719-d562ccb73c4f",
    approvedAt: "2026-08-01T11:59:00Z",
    binding: proposal.binding,
    expiresAt: "2026-08-01T12:05:00Z",
    nonce,
    proposalBindingSha256: proposal.bindingSha256,
    proposalId: proposal.id,
    proposalVersion: proposal.version,
    provenance: {
      issuer: "operator-console",
      keyId: "approval-key-1",
      signature: "b".repeat(64),
    },
    version: "v1",
  });
