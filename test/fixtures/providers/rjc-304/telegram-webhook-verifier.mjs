import { createHash, timingSafeEqual } from "node:crypto";

// Telegram documents secret_token as 1-256 characters of A-Z, a-z, 0-9, _ and -.
const SECRET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/u;
const SECRET_HEADER = "x-telegram-bot-api-secret-token";
const MINIMUM_SECRET_LENGTH = 32;

export const TELEGRAM_PIN = Object.freeze({
  adapter: "@chat-adapter/telegram@4.36.0",
  core: "chat@4.36.0",
  decisionRecord: "docs/decisions/0003-telegram-channel-pivot.md",
  productionTraffic: false,
  provider: "telegram",
});

/**
 * Telegram's header secret is a bearer credential, not an HMAC over the
 * payload, so the comparison is the whole authenticity check. Digesting both
 * sides to a fixed 32 bytes keeps the comparison constant-time and stops the
 * raw length of the configured secret from leaking through either a timing
 * difference or timingSafeEqual's throw on unequal buffer lengths.
 */
const secretsMatch = (presented, expected) => {
  if (typeof presented !== "string" || typeof expected !== "string") {
    return false;
  }
  return timingSafeEqual(
    createHash("sha256").update(presented, "utf-8").digest(),
    createHash("sha256").update(expected, "utf-8").digest()
  );
};

export const assertUsableSecretToken = (secret) => {
  if (!SECRET_TOKEN_PATTERN.test(secret ?? "")) {
    throw new Error(
      "Telegram secret_token must be 1-256 characters of A-Za-z0-9_-"
    );
  }
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `Telegram secret_token must be at least ${MINIMUM_SECRET_LENGTH} characters; it is the only authenticity check`
    );
  }
  return secret;
};

/**
 * Adapter-side receiver for the RJC-304 evidence lane. It decides authenticity
 * and duplication only. Authorization stays with @sammys/policy, which
 * consumes the minted receipt - a channel identity never carries authority.
 */
export const createTelegramWebhookReceiver = ({
  allowedUpdates,
  environment,
  expiresInSeconds = 300,
  secretToken,
}) => {
  if (environment !== "fixture") {
    throw new Error("Telegram production traffic is disabled");
  }
  assertUsableSecretToken(secretToken);
  if (!(Array.isArray(allowedUpdates) && allowedUpdates.length > 0)) {
    throw new Error(
      "allowedUpdates must list the update types actually consumed; an empty list means every type"
    );
  }

  const seenUpdateIds = new Set();
  const allowed = new Set(allowedUpdates);

  return {
    acceptedCount: () => seenUpdateIds.size,
    receive: ({ bindingSha256, headers, receivedAt, update }) => {
      if (!secretsMatch(headers?.[SECRET_HEADER], secretToken)) {
        return { outcome: "rejected", reason: "secret-token-mismatch" };
      }
      if (!Number.isSafeInteger(update?.update_id)) {
        return { outcome: "rejected", reason: "update-id-invalid" };
      }
      // Telegram states at most one optional field is present in any update.
      // A forged payload can still carry several, and picking the first match
      // would smuggle an unsubscribed type past this check, so a violated
      // guarantee fails closed rather than being interpreted.
      const updateTypes = Object.keys(update).filter(
        (key) => key !== "update_id"
      );
      if (updateTypes.length !== 1) {
        return { outcome: "rejected", reason: "update-shape-invalid" };
      }
      if (!allowed.has(updateTypes[0])) {
        return { outcome: "rejected", reason: "update-type-not-subscribed" };
      }
      if (seenUpdateIds.has(update.update_id)) {
        return { outcome: "duplicate", reason: "update-id-already-processed" };
      }

      seenUpdateIds.add(update.update_id);
      const verifiedAt = new Date(receivedAt);
      return {
        outcome: "accepted",
        // Shaped for WebhookVerificationRepository.consumeVerifiedReceipt.
        receipt: {
          bindingSha256,
          expiresAt: new Date(
            verifiedAt.getTime() + expiresInSeconds * 1000
          ).toISOString(),
          provider: TELEGRAM_PIN.provider,
          receiptId: `telegram-update-${update.update_id}`,
          verifiedAt: verifiedAt.toISOString(),
        },
      };
    },
  };
};
