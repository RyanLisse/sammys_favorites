import type { ActionBinding } from "@sammys/contracts";
import { actionBindingSchema } from "@sammys/contracts";

import { sha256CanonicalJson } from "./canonical-json.js";
import type {
  ApprovalExecutionRepository,
  ExecutionClaim,
  ExecutionClaimResult,
  VerifiedApprovalRecord,
} from "./execution-approval-repository.js";
import type { OutboundTargetVerifier } from "./outbound-target-verifier.js";
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
} from "./outbound-target-verifier.js";
export { InMemoryWebhookVerificationRepository } from "./webhook-verification-repository.js";
export type {
  WebhookVerificationReceipt,
  WebhookVerificationRepository,
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

const validateUntrustedInput = async (
  context: PolicyContext,
  action: PolicyAction,
  capability: PolicyCapability
): Promise<PolicyDecision | null> => {
  if (action.containsSecret) {
    return deny("SECRET_IN_ACTION");
  }
  if (
    OUTBOUND_CAPABILITIES.has(capability) &&
    !(await context.outboundTargetVerifier?.verify(
      capability,
      action.binding.resource.target
    ))
  ) {
    return deny("UNSAFE_TARGET");
  }
  if (capability === "webhook.receive") {
    const receipt = action.webhookVerificationReceiptId
      ? await context.webhookVerificationRepository?.getVerifiedReceipt(
          action.webhookVerificationReceiptId
        )
      : null;
    const now = context.now.getTime();
    if (
      !receipt ||
      Date.parse(receipt.verifiedAt) > now ||
      Date.parse(receipt.expiresAt) <= now ||
      receipt.bindingSha256 !== sha256CanonicalJson(action.binding)
    ) {
      return deny("UNTRUSTED_WEBHOOK");
    }
  }
  if (
    action.untrustedInstructions &&
    (action.binding.stage === "propose" || action.binding.stage === "execute")
  ) {
    return deny("PROMPT_INJECTION_RISK");
  }
  return null;
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
  action: PolicyAction
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
    const failure =
      knownCapabilityFailure ??
      (await validateUntrustedInput(context, normalizedAction, capability));
    if (failure) {
      return failure;
    }
    if (APPROVAL_REQUIRED_CAPABILITIES.has(capability)) {
      const claimDecision = await claimApprovedExecution(
        context,
        normalizedAction
      );
      return claimDecision;
    }
    return { allowed: true, reasonCode: "ALLOW", requiredApproval: "none" };
  };
}

export const createProposalBindingHash = (binding: ActionBinding): string =>
  sha256CanonicalJson(binding);
