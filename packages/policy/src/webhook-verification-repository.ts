export interface WebhookVerificationReceipt {
  readonly bindingSha256: string;
  readonly expiresAt: string;
  readonly provider: string;
  readonly receiptId: string;
  readonly verifiedAt: string;
}

export interface WebhookVerificationRepository {
  getVerifiedReceipt: (
    receiptId: string
  ) => Promise<WebhookVerificationReceipt | null>;
}

export class InMemoryWebhookVerificationRepository implements WebhookVerificationRepository {
  readonly #receipts: ReadonlyMap<string, WebhookVerificationReceipt>;

  constructor(receipts: readonly WebhookVerificationReceipt[]) {
    this.#receipts = new Map(
      receipts.map((receipt) => [
        receipt.receiptId,
        Object.freeze({ ...receipt }),
      ])
    );
  }

  getVerifiedReceipt = (
    receiptId: string
  ): Promise<WebhookVerificationReceipt | null> =>
    Promise.resolve(this.#receipts.get(receiptId) ?? null);
}
