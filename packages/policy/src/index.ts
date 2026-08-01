import type { ActionBinding, Approval, Proposal } from "@sammys/contracts";
import {
  actionBindingSchema,
  approvalSchema,
  proposalSchema,
} from "@sammys/contracts";

import { sha256CanonicalJson } from "./canonical-json.js";
import type { NonceStore } from "./nonce-store.js";

export { canonicalizeJson, sha256CanonicalJson } from "./canonical-json.js";
export { InMemoryNonceStore } from "./nonce-store.js";
export type { NonceStore } from "./nonce-store.js";

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
  | "APPROVAL_NOT_YET_VALID"
  | "APPROVAL_REQUIRED"
  | "APPROVER_NOT_AUTHORIZED"
  | "CAPABILITY_NOT_GRANTED"
  | "DIRECT_AGENT_EXECUTION_DENIED"
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
  readonly authorizedApprovers: ReadonlySet<string>;
  readonly grants: ReadonlySet<PolicyCapability>;
  readonly killSwitches?: ReadonlySet<PolicyCapability | "all-writes">;
  readonly nonceStore: NonceStore;
  readonly now: Date;
  readonly principalKind: PrincipalKind;
}

export interface PolicyAction {
  readonly approval?: Approval;
  readonly binding: ActionBinding;
  readonly containsSecret?: boolean;
  readonly proposal?: Proposal;
  readonly targetUrl?: string;
  readonly untrustedInstructions?: boolean;
  readonly webhookSignatureVerified?: boolean;
}

export interface PolicyDecision {
  readonly allowed: boolean;
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

const deny = (
  reasonCode: PolicyReasonCode,
  requiredApproval: RequiredApproval = "none"
): PolicyDecision => ({ allowed: false, reasonCode, requiredApproval });

const isSafeTarget = (targetUrl: string): boolean => {
  try {
    const url = new URL(targetUrl);
    const hostname = url.hostname.toLowerCase();
    const isLocal =
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      /^172\.(?<privateOctet>1[6-9]|2\d|3[01])\./u.test(hostname);
    return (
      url.protocol === "https:" && !isLocal && !url.username && !url.password
    );
  } catch {
    return false;
  }
};

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
  if (
    APPROVAL_REQUIRED_CAPABILITIES.has(capability) &&
    context.principalKind === "agent"
  ) {
    return deny("DIRECT_AGENT_EXECUTION_DENIED", "human");
  }
  return null;
};

const validateUntrustedInput = (
  action: PolicyAction,
  capability: PolicyCapability
): PolicyDecision | null => {
  if (action.containsSecret) {
    return deny("SECRET_IN_ACTION");
  }
  if (
    action.targetUrl &&
    (action.targetUrl !== action.binding.resource.target ||
      !isSafeTarget(action.targetUrl))
  ) {
    return deny("UNSAFE_TARGET");
  }
  if (capability === "webhook.receive" && !action.webhookSignatureVerified) {
    return deny("UNTRUSTED_WEBHOOK");
  }
  if (
    action.untrustedInstructions &&
    (action.binding.stage === "propose" || action.binding.stage === "execute")
  ) {
    return deny("PROMPT_INJECTION_RISK");
  }
  return null;
};

const parseApprovalEvidence = (
  action: PolicyAction
): { readonly approval: Approval; readonly proposal: Proposal } | null => {
  const approvalResult = approvalSchema.safeParse(action.approval);
  const proposalResult = proposalSchema.safeParse(action.proposal);
  if (!(approvalResult.success && proposalResult.success)) {
    return null;
  }
  return { approval: approvalResult.data, proposal: proposalResult.data };
};

const validateApprovalBinding = (
  context: PolicyContext,
  action: PolicyAction,
  evidence: { readonly approval: Approval; readonly proposal: Proposal }
): PolicyDecision | null => {
  const { approval, proposal } = evidence;
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
  if (Date.parse(approval.approvedAt) < Date.parse(proposal.createdAt)) {
    return deny("APPROVAL_MISMATCH", "human");
  }
  const actionHash = sha256CanonicalJson(action.binding);
  const proposalHash = sha256CanonicalJson(proposal.binding);
  const approvalHash = sha256CanonicalJson(approval.binding);
  const matches =
    approval.proposalId === proposal.id &&
    approval.proposalVersion === proposal.version &&
    approval.proposalBindingSha256 === proposal.bindingSha256 &&
    actionHash === proposal.bindingSha256 &&
    proposalHash === proposal.bindingSha256 &&
    approvalHash === proposal.bindingSha256;
  return matches ? null : deny("APPROVAL_MISMATCH", "human");
};

const validateAndConsumeApproval = async (
  context: PolicyContext,
  action: PolicyAction
): Promise<PolicyDecision | null> => {
  const evidence = parseApprovalEvidence(action);
  if (!evidence) {
    return deny("APPROVAL_REQUIRED", "human");
  }
  const bindingFailure = validateApprovalBinding(context, action, evidence);
  if (bindingFailure) {
    return bindingFailure;
  }
  const consumed = await context.nonceStore.consume(evidence.approval.nonce);
  return consumed ? null : deny("REPLAY_DETECTED", "human");
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
    const failure =
      validateKnownCapability(context, normalizedAction, capability) ??
      validateUntrustedInput(normalizedAction, capability);
    if (failure) {
      return failure;
    }
    if (APPROVAL_REQUIRED_CAPABILITIES.has(capability)) {
      const approvalFailure = await validateAndConsumeApproval(
        context,
        normalizedAction
      );
      if (approvalFailure) {
        return approvalFailure;
      }
    }
    return { allowed: true, reasonCode: "ALLOW", requiredApproval: "none" };
  };
}

export const createProposalBindingHash = (binding: ActionBinding): string =>
  sha256CanonicalJson(binding);
