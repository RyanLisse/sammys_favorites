export interface WebhookVerificationReceipt {
  readonly bindingSha256: string;
  readonly expiresAt: string;
  readonly provider: string;
  readonly receiptId: string;
  readonly verifiedAt: string;
}

export interface WebhookVerificationRepository {
  consumeVerifiedReceipt: (
    request: WebhookReceiptConsumptionRequest
  ) => Promise<WebhookVerificationReceipt | null>;
}

export interface WebhookReceiptConsumptionRequest {
  readonly bindingSha256: string;
  readonly now: Date;
  readonly provider: string;
  readonly receiptId: string;
}

export class InMemoryWebhookVerificationRepository implements WebhookVerificationRepository {
  readonly #receipts: Map<string, WebhookVerificationReceipt>;

  constructor(receipts: readonly WebhookVerificationReceipt[]) {
    this.#receipts = new Map(
      receipts.map((receipt) => [
        receipt.receiptId,
        Object.freeze({ ...receipt }),
      ])
    );
  }

  consumeVerifiedReceipt = (
    request: WebhookReceiptConsumptionRequest
  ): Promise<WebhookVerificationReceipt | null> => {
    const receipt = this.#receipts.get(request.receiptId);
    const verifiedAt = receipt ? Date.parse(receipt.verifiedAt) : Number.NaN;
    const expiresAt = receipt ? Date.parse(receipt.expiresAt) : Number.NaN;
    const now = request.now.getTime();
    const isValid = Boolean(
      receipt &&
      Number.isFinite(now) &&
      Number.isFinite(verifiedAt) &&
      Number.isFinite(expiresAt) &&
      verifiedAt <= now &&
      expiresAt > now &&
      receipt.bindingSha256 === request.bindingSha256 &&
      receipt.provider === request.provider
    );
    if (!(receipt && isValid)) {
      return Promise.resolve(null);
    }
    this.#receipts.delete(request.receiptId);
    return Promise.resolve(receipt);
  };
}
