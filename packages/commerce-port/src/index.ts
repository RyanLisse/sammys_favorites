import type { Cart, Product } from "@sammys/contracts";
import { moneySchema } from "@sammys/contracts";
import { z } from "zod";

const commandBaseSchema = z.object({
  commandId: z.uuid(),
  requestedAt: z.iso.datetime({ offset: true }),
  requestedBy: z.string().min(1),
});

export const commerceWorkflowCommandSchema = z.discriminatedUnion("type", [
  commandBaseSchema
    .extend({
      price: moneySchema,
      productId: z.string().min(1),
      type: z.literal("catalog.set-price"),
    })
    .strict()
    .readonly(),
  commandBaseSchema
    .extend({
      delta: z.number().int().safe(),
      reason: z.string().min(1).max(500),
      sku: z.string().min(1),
      type: z.literal("inventory.adjust"),
    })
    .strict()
    .readonly(),
  commandBaseSchema
    .extend({
      quantity: z.number().int().positive(),
      reservationId: z.string().min(1),
      sku: z.string().min(1),
      type: z.literal("inventory.reserve"),
    })
    .strict()
    .readonly(),
]);

export type CommerceWorkflowCommand = z.infer<
  typeof commerceWorkflowCommandSchema
>;

export interface WorkflowSubmissionReceipt {
  readonly commandId: string;
  readonly status: "accepted" | "rejected";
  readonly workflowId?: string;
}

/** A deliberately narrow application boundary; it is not an Admin API client. */
export interface CommercePort {
  getCart: (cartId: string) => Promise<Cart | null>;
  getProduct: (productId: string) => Promise<Product | null>;
  submitWorkflowCommand: (
    command: CommerceWorkflowCommand
  ) => Promise<WorkflowSubmissionReceipt>;
}
