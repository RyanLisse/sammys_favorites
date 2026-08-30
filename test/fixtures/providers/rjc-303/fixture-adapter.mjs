const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const STATUS_ORDER = new Map([
  ["accepted", 0],
  ["sent", 1],
  ["delivered", 2],
  ["read", 3],
]);

export const CHAT_SDK_PIN = Object.freeze({
  adapter: "@chat-adapter/whatsapp@4.36.0",
  core: "chat@4.36.0",
  graphApiVersion: "v25.0",
  productionTraffic: false,
});

const isRedactedHash = (value) =>
  typeof value === "string" && HASH_PATTERN.test(value);

export const createFixtureAdapter = ({ environment }) => {
  if (environment !== "fixture") {
    throw new Error("Chat SDK production traffic is disabled");
  }

  const acceptedMessageIds = new Set();
  const deliveryStatuses = new Map();

  return {
    acceptedCount: () => acceptedMessageIds.size,
    receive: (event) => {
      if (event.signatureValid !== true) {
        return { outcome: "rejected", reason: "signature-invalid" };
      }

      const identityValues = [
        event.messageIdHash,
        event.phoneNumberIdHash,
        event.userWaIdHash,
      ];
      if (!identityValues.every(isRedactedHash)) {
        return { outcome: "rejected", reason: "identity-not-redacted" };
      }

      if (acceptedMessageIds.has(event.messageIdHash)) {
        return { outcome: "duplicate" };
      }

      acceptedMessageIds.add(event.messageIdHash);
      const channelIdentity = {
        phoneNumberIdHash: event.phoneNumberIdHash,
        provider: "whatsapp",
        userWaIdHash: event.userWaIdHash,
      };

      return {
        channelIdentity,
        outcome: "accepted",
        threadId: `whatsapp:${event.phoneNumberIdHash}:${event.userWaIdHash}`,
      };
    },
    recordStatus: (messageIdHash, nextStatus, failure) => {
      if (!isRedactedHash(messageIdHash)) {
        return { outcome: "rejected", reason: "identity-not-redacted" };
      }

      const currentStatus = deliveryStatuses.get(messageIdHash);
      if (currentStatus === "failed") {
        return { outcome: "terminal" };
      }

      if (nextStatus === "failed") {
        if (currentStatus === "delivered" || currentStatus === "read") {
          return { outcome: "terminal" };
        }

        deliveryStatuses.set(messageIdHash, "failed");
        return {
          code: failure?.code ?? "provider-failure",
          outcome: "failed",
        };
      }

      const nextOrder = STATUS_ORDER.get(nextStatus);
      if (nextOrder === undefined) {
        return { outcome: "rejected", reason: "unknown-status" };
      }

      const currentOrder = STATUS_ORDER.get(currentStatus) ?? -1;
      if (nextOrder <= currentOrder) {
        return { outcome: "stale" };
      }

      deliveryStatuses.set(messageIdHash, nextStatus);
      return { outcome: "updated" };
    },
  };
};

export const evaluateCommerceAuthorization = ({
  expectedActionBindingHash,
  trustedApprovalReceipt,
}) => {
  const hasTrustedApproval =
    trustedApprovalReceipt?.authenticated === true &&
    trustedApprovalReceipt.source === "atelier" &&
    isRedactedHash(expectedActionBindingHash) &&
    trustedApprovalReceipt.actionBindingHash === expectedActionBindingHash;

  if (!hasTrustedApproval) {
    return {
      authorized: false,
      reason: "authenticated-action-bound-approval-required",
    };
  }

  return { authority: "trusted-approval-receipt", authorized: true };
};
