import type { ActionBinding } from "@sammys/contracts";
import { actionBindingSchema } from "@sammys/contracts";

import { sha256CanonicalJson } from "./canonical-json.js";
import type {
  ApprovalExecutionRepository,
  ExecutionClaim,
  ExecutionClaimResult,
  VerifiedApprovalRecord,
} from "./execution-approval-repository.js";
import type {
  OutboundTargetVerifier,
  VerifiedOutboundConnectionPlan,
} from "./outbound-target-verifier.js";
import type { WebhookVerificationRepository } from "./webhook-verification-repository.js";

export {
  createApprovalSignature,
  HmacApprovalVerifier,
} from "./approval-verifier.js";
export type { ApprovalVerifier } from "./approval-verifier.js";
export { canonicalizeJson, sha256CanonicalJson } from "./canonical-json.js";
export { InMemoryApprovalExecutionRepository } from "./execution-approval-repository.js";
export { PostgresApprovalExecutionRepository } from "./postgres-approval-execution-repository.js";
export type {
  ApprovalExecutionRepository,
  ExecutionClaim,
  ExecutionClaimRequest,
  ExecutionClaimResult,
  ExecutionCompletion,
  VerifiedApprovalRecord,
} from "./execution-approval-repository.js";
export {
  DnsPinnedOutboundTargetVerifier,
  isPublicIpAddress,
} from "./outbound-target-verifier.js";
export type {
  AddressResolver,
  OutboundTargetVerifier,
  ResolvedAddress,
  VerifiedOutboundConnectionPlan,
} from "./outbound-target-verifier.js";
export { InMemoryWebhookVerificationRepository } from "./webhook-verification-repository.js";
export type {
  WebhookVerificationReceipt,
  WebhookVerificationRepository,
  WebhookReceiptConsumptionRequest,
} from "./webhook-verification-repository.js";

export const POLICY_CAPABILITIES = [
  "cart.read",
  "product.read",
  "proposal.draft",
  "proposal.submit",
  "proposal.approve",
  "commerce.workflow.execute",
  "supplier.snapshot.read",
  "supplier.quote.create",
  "supplier.order.execute",
  "webhook.receive",
] as const;

export type PolicyCapability = (typeof POLICY_CAPABILITIES)[number];
export type ActionStage = ActionBinding["stage"];
export type PrincipalKind = "agent" | "human" | "service";
export type RequiredApproval = "human" | "none";

export type PolicyReasonCode =
  | "ALLOW"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_MISMATCH"
  | "APPROVAL_NOT_VERIFIED"
  | "APPROVAL_NOT_YET_VALID"
  | "APPROVAL_REQUIRED"
  | "APPROVER_NOT_AUTHORIZED"
  | "CAPABILITY_NOT_GRANTED"
  | "DIRECT_AGENT_EXECUTION_DENIED"
  | "EXECUTION_CLAIM_FAILED"
  | "GENERIC_CAPABILITY_DENIED"
  | "INVALID_ACTION"
  | "KILL_SWITCH_ACTIVE"
  | "PROMPT_INJECTION_RISK"
  | "REPLAY_DETECTED"
  | "SECRET_IN_ACTION"
  | "UNTRUSTED_WEBHOOK"
  | "UNSAFE_TARGET"
  | "UNKNOWN_CAPABILITY"
  | "WRONG_STAGE";

export interface PolicyContext {
  readonly actorId: string;
  readonly approvalRepository: ApprovalExecutionRepository;
  readonly authorizedApprovers: ReadonlySet<string>;
  readonly grants: ReadonlySet<PolicyCapability>;
  readonly expectedWebhookProvider?: string;
  readonly killSwitches?: ReadonlySet<PolicyCapability | "all-writes">;
  readonly now: Date;
  readonly outboundTargetVerifier?: OutboundTargetVerifier;
  readonly principalKind: PrincipalKind;
  readonly webhookVerificationRepository?: WebhookVerificationRepository;
}

export interface PolicyAction {
  readonly approvalId?: string;
  readonly binding: ActionBinding;
  readonly containsSecret?: boolean;
  readonly idempotencyKey?: string;
  readonly untrustedInstructions?: boolean;
  readonly webhookVerificationReceiptId?: string;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly executionClaim?: ExecutionClaim;
  readonly outboundConnectionPlan?: VerifiedOutboundConnectionPlan;
  readonly reasonCode: PolicyReasonCode;
  readonly requiredApproval: RequiredApproval;
}

export interface PolicyEvaluator {
  evaluate: (
    context: PolicyContext,
    action: PolicyAction
  ) => Promise<PolicyDecision>;
}

export const CAPABILITY_STAGE = {
  "cart.read": "read",
  "commerce.workflow.execute": "execute",
  "product.read": "read",
  "proposal.approve": "approve",
  "proposal.draft": "draft",
  "proposal.submit": "propose",
  "supplier.order.execute": "execute",
  "supplier.quote.create": "propose",
  "supplier.snapshot.read": "read",
  "webhook.receive": "execute",
} as const satisfies Readonly<Record<PolicyCapability, ActionStage>>;

const GENERIC_CAPABILITIES = new Set([
  "browser",
  "http",
  "medusa.admin",
  "sql",
]);
const APPROVAL_REQUIRED_CAPABILITIES = new Set<PolicyCapability>([
  "commerce.workflow.execute",
  "supplier.order.execute",
]);
const OUTBOUND_CAPABILITIES = new Set<PolicyCapability>([
  "supplier.order.execute",
  "supplier.quote.create",
  "supplier.snapshot.read",
]);

const SECRET_KEY_PATTERN =
  /(?:authorization|cookie|credential|password|passwd|privatekey|secret|token|apikey|clientsecret)/iu;
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u,
  /\b(?:bearer|basic)\s+[a-z0-9+/._~=-]{8,}/iu,
  /\b(?:sk|rk)_(?:live|test)_[a-z0-9]{12,}\b/iu,
  /\b(?:gh[opusr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,})\b/iu,
  /\bxox[baprs]-[a-z0-9-]{10,}\b/iu,
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/u,
  /\b(?:api[_-]?key|client[_-]?secret|password|token)\s*[:=]\s*[^\s,;]{6,}/iu,
];

const normalizedSecretKey = (key: string): string =>
  key.replaceAll(/[^a-z0-9]/giu, "");

const containsSecretShape = (value: unknown): boolean => {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsSecretShape(entry));
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(
    ([key, entry]) =>
      SECRET_KEY_PATTERN.test(normalizedSecretKey(key)) ||
      containsSecretShape(entry)
  );
};

const deny = (
  reasonCode: PolicyReasonCode,
  requiredApproval: RequiredApproval = "none"
): PolicyDecision => ({ allowed: false, reasonCode, requiredApproval });

const validateKnownCapability = (
  context: PolicyContext,
  action: PolicyAction,
  capability: PolicyCapability
): PolicyDecision | null => {
  if (CAPABILITY_STAGE[capability] !== action.binding.stage) {
    return deny("WRONG_STAGE");
  }
  if (
    context.killSwitches?.has(capability) ||
    (action.binding.stage !== "read" && context.killSwitches?.has("all-writes"))
  ) {
    return deny("KILL_SWITCH_ACTIVE");
  }
  if (!context.grants.has(capability)) {
    return deny("CAPABILITY_NOT_GRANTED");
  }
  if (capability === "proposal.approve" && context.principalKind !== "human") {
    return deny("WRONG_STAGE", "human");
  }
  if (action.binding.stage === "execute" && context.principalKind === "agent") {
    return deny("DIRECT_AGENT_EXECUTION_DENIED", "human");
  }
  return null;
};

interface UntrustedInputValidation {
  readonly failure: PolicyDecision | null;
  readonly outboundConnectionPlan?: VerifiedOutboundConnectionPlan;
}

const validateUntrustedInput = async (
  context: PolicyContext,
  action: PolicyAction,
  capability: PolicyCapability
): Promise<UntrustedInputValidation> => {
  const persistableAction = {
    approvalId: action.approvalId,
    binding: action.binding,
    idempotencyKey: action.idempotencyKey,
    webhookVerificationReceiptId: action.webhookVerificationReceiptId,
  };
  if (action.containsSecret || containsSecretShape(persistableAction)) {
    return { failure: deny("SECRET_IN_ACTION") };
  }
  const outboundConnectionPlan = OUTBOUND_CAPABILITIES.has(capability)
    ? ((await context.outboundTargetVerifier?.createConnectionPlan(
        capability,
        action.binding.resource.target
      )) ?? undefined)
    : undefined;
  if (OUTBOUND_CAPABILITIES.has(capability) && !outboundConnectionPlan) {
    return { failure: deny("UNSAFE_TARGET") };
  }
  if (
    action.untrustedInstructions &&
    (action.binding.stage === "propose" || action.binding.stage === "execute")
  ) {
    return { failure: deny("PROMPT_INJECTION_RISK") };
  }
  if (capability === "webhook.receive") {
    const bindingSha256 = sha256CanonicalJson(action.binding);
    const receipt =
      action.webhookVerificationReceiptId && context.expectedWebhookProvider
        ? await context.webhookVerificationRepository?.consumeVerifiedReceipt({
            bindingSha256,
            now: context.now,
            provider: context.expectedWebhookProvider,
            receiptId: action.webhookVerificationReceiptId,
          })
        : null;
    if (!receipt) {
      return { failure: deny("UNTRUSTED_WEBHOOK") };
    }
  }
  return { failure: null, outboundConnectionPlan };
};

const validateTrustedApproval = (
  context: PolicyContext,
  action: PolicyAction,
  record: VerifiedApprovalRecord
): PolicyDecision | null => {
  const { approval, proposal } = record;
  const now = context.now.getTime();
  if (
    Date.parse(approval.approvedAt) > now ||
    Date.parse(proposal.createdAt) > now
  ) {
    return deny("APPROVAL_NOT_YET_VALID", "human");
  }
  if (
    Date.parse(approval.expiresAt) <= now ||
    Date.parse(proposal.expiresAt) <= now
  ) {
    return deny("APPROVAL_EXPIRED", "human");
  }
  if (!context.authorizedApprovers.has(approval.actorId)) {
    return deny("APPROVER_NOT_AUTHORIZED", "human");
  }
  const bindingHash = sha256CanonicalJson(action.binding);
  const matches =
    approval.proposalId === proposal.id &&
    approval.proposalVersion === proposal.version &&
    approval.proposalBindingSha256 === proposal.bindingSha256 &&
    bindingHash === proposal.bindingSha256 &&
    sha256CanonicalJson(proposal.binding) === proposal.bindingSha256 &&
    sha256CanonicalJson(approval.binding) === proposal.bindingSha256;
  return matches ? null : deny("APPROVAL_MISMATCH", "human");
};

const claimFailure = (result: ExecutionClaimResult): PolicyDecision => {
  if (result.status === "replay") {
    return deny("REPLAY_DETECTED", "human");
  }
  if (result.status === "expired") {
    return deny("APPROVAL_EXPIRED", "human");
  }
  if (result.status === "unauthorized-actor") {
    return deny("APPROVER_NOT_AUTHORIZED", "human");
  }
  if (result.status === "mismatch") {
    return deny("APPROVAL_MISMATCH", "human");
  }
  return deny("EXECUTION_CLAIM_FAILED", "human");
};

const claimApprovedExecution = async (
  context: PolicyContext,
  action: PolicyAction,
  outboundConnectionPlan?: VerifiedOutboundConnectionPlan
): Promise<PolicyDecision> => {
  if (!(action.approvalId && action.idempotencyKey)) {
    return deny("APPROVAL_REQUIRED", "human");
  }
  const record = await context.approvalRepository.getVerifiedApproval(
    action.approvalId
  );
  if (!record) {
    return deny("APPROVAL_NOT_VERIFIED", "human");
  }
  const validationFailure = validateTrustedApproval(context, action, record);
  if (validationFailure) {
    return validationFailure;
  }
  const bindingSha256 = sha256CanonicalJson(action.binding);
  const result = await context.approvalRepository.claimExecution({
    actorId: context.actorId,
    approvalId: action.approvalId,
    auditReasonCode: "ALLOW",
    authorizedApprovers: context.authorizedApprovers,
    binding: action.binding,
    bindingSha256,
    expectedRevision: record.revision,
    idempotencyKey: action.idempotencyKey,
    now: context.now,
  });
  return result.status === "claimed"
    ? {
        allowed: true,
        executionClaim: result.claim,
        outboundConnectionPlan,
        reasonCode: "ALLOW",
        requiredApproval: "none",
      }
    : claimFailure(result);
};

export class DefaultPolicyEvaluator implements PolicyEvaluator {
  readonly policyVersion = "v1" as const;

  evaluate = async (
    context: PolicyContext,
    action: PolicyAction
  ): Promise<PolicyDecision> => {
    void this.policyVersion;
    const bindingResult = actionBindingSchema.safeParse(action.binding);
    if (!bindingResult.success) {
      return deny("INVALID_ACTION");
    }
    const normalizedAction = { ...action, binding: bindingResult.data };
    const requestedCapability = normalizedAction.binding.capability;
    if (
      !POLICY_CAPABILITIES.includes(requestedCapability as PolicyCapability)
    ) {
      return deny(
        GENERIC_CAPABILITIES.has(requestedCapability)
          ? "GENERIC_CAPABILITY_DENIED"
          : "UNKNOWN_CAPABILITY"
      );
    }
    const capability = requestedCapability as PolicyCapability;
    const knownCapabilityFailure = validateKnownCapability(
      context,
      normalizedAction,
      capability
    );
    if (knownCapabilityFailure) {
      return knownCapabilityFailure;
    }
    const untrustedInput = await validateUntrustedInput(
      context,
      normalizedAction,
      capability
    );
    if (untrustedInput.failure) {
      return untrustedInput.failure;
    }
    if (APPROVAL_REQUIRED_CAPABILITIES.has(capability)) {
      const claimDecision = await claimApprovedExecution(
        context,
        normalizedAction,
        untrustedInput.outboundConnectionPlan
      );
      return claimDecision;
    }
    return {
      allowed: true,
      outboundConnectionPlan: untrustedInput.outboundConnectionPlan,
      reasonCode: "ALLOW",
      requiredApproval: "none",
    };
  };
}

export const createProposalBindingHash = (binding: ActionBinding): string =>
  sha256CanonicalJson(binding);
