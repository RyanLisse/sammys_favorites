export interface NonceStore {
  consume: (nonce: string) => Promise<boolean>;
  has: (nonce: string) => Promise<boolean>;
}

export class InMemoryNonceStore implements NonceStore {
  readonly #consumed = new Set<string>();

  consume = (nonce: string): Promise<boolean> => {
    if (this.#consumed.has(nonce)) {
      return Promise.resolve(false);
    }
    this.#consumed.add(nonce);
    return Promise.resolve(true);
  };

  has = (nonce: string): Promise<boolean> =>
    Promise.resolve(this.#consumed.has(nonce));
}
