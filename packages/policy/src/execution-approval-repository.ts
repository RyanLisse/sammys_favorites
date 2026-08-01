import type {
  ActionBinding,
  Approval,
  ExecutionAuditReceipt,
  JsonValue,
  Proposal,
} from "@sammys/contracts";
import { approvalSchema, proposalSchema } from "@sammys/contracts";

import type { ApprovalVerifier } from "./approval-verifier.js";
import { sha256CanonicalJson } from "./canonical-json.js";

export interface VerifiedApprovalRecord {
  readonly approval: Approval;
  readonly proposal: Proposal;
  readonly revision: string;
}

export interface ExecutionClaimRequest {
  readonly actorId: string;
  readonly approvalId: string;
  readonly auditReasonCode: "ALLOW";
  readonly authorizedApprovers: ReadonlySet<string>;
  readonly binding: ActionBinding;
  readonly bindingSha256: string;
  readonly expectedRevision: string;
  readonly idempotencyKey: string;
  readonly now: Date;
}

export interface ExecutionClaim {
  readonly approvalId: string;
  readonly auditReceiptId: string;
  readonly bindingSha256: string;
  readonly claimId: string;
  readonly executionIntentId: string;
  readonly idempotencyKey: string;
  readonly outboxMessageId: string;
  readonly status: "completed" | "pending";
}

export type ExecutionClaimResult =
  | {
      readonly claim: ExecutionClaim;
      readonly retry: boolean;
      readonly status: "claimed";
    }
  | {
      readonly status:
        | "expired"
        | "mismatch"
        | "not-found"
        | "provenance-invalid"
        | "replay"
        | "unauthorized-actor";
    };

export interface ExecutionCompletion {
  readonly completedAt: Date;
  readonly outcome: "failed" | "succeeded";
}

export interface ApprovalExecutionRepository {
  completeExecution: (
    claimId: string,
    completion: ExecutionCompletion
  ) => Promise<boolean>;
  getVerifiedApproval: (
    approvalId: string
  ) => Promise<VerifiedApprovalRecord | null>;
  claimExecution: (
    request: ExecutionClaimRequest
  ) => Promise<ExecutionClaimResult>;
}

interface StoredExecutionState {
  audit: ExecutionAuditReceipt;
  claim: ExecutionClaim;
  completion?: ExecutionCompletion;
  intent: {
    readonly binding: ActionBinding;
    readonly status: "completed" | "failed" | "pending";
  };
  outbox: {
    readonly payload: JsonValue;
    readonly status: "delivered" | "pending";
  };
}

const claimIdentifier = (
  prefix: string,
  approvalId: string,
  idempotencyKey: string
): string =>
  `${prefix}_${sha256CanonicalJson({ approvalId, idempotencyKey }).slice(0, 24)}`;

export class InMemoryApprovalExecutionRepository implements ApprovalExecutionRepository {
  readonly #approvals = new Map<string, VerifiedApprovalRecord>();
  readonly #claimsByApproval = new Map<string, StoredExecutionState>();
  readonly #claimsById = new Map<string, StoredExecutionState>();
  readonly #verifier: ApprovalVerifier;

  constructor(
    records: readonly VerifiedApprovalRecord[],
    verifier: ApprovalVerifier
  ) {
    this.#verifier = verifier;
    for (const record of records) {
      const approval = approvalSchema.parse(record.approval);
      const proposal = proposalSchema.parse(record.proposal);
      this.#approvals.set(
        approval.approvalId,
        Object.freeze({ approval, proposal, revision: record.revision })
      );
    }
  }

  getVerifiedApproval = async (
    approvalId: string
  ): Promise<VerifiedApprovalRecord | null> => {
    const record = this.#approvals.get(approvalId);
    if (!record || !(await this.#verifier.verify(record.approval))) {
      return null;
    }
    return record;
  };

  claimExecution = async (
    request: ExecutionClaimRequest
  ): Promise<ExecutionClaimResult> => {
    const record = this.#approvals.get(request.approvalId);
    if (!record) {
      return { status: "not-found" };
    }
    if (!(await this.#verifier.verify(record.approval))) {
      return { status: "provenance-invalid" };
    }
    const { approval, proposal } = record;
    if (!request.authorizedApprovers.has(approval.actorId)) {
      return { status: "unauthorized-actor" };
    }
    if (
      Date.parse(approval.expiresAt) <= request.now.getTime() ||
      Date.parse(proposal.expiresAt) <= request.now.getTime()
    ) {
      return { status: "expired" };
    }
    const bindingMatches =
      record.revision === request.expectedRevision &&
      request.bindingSha256 === proposal.bindingSha256 &&
      sha256CanonicalJson(request.binding) === proposal.bindingSha256 &&
      sha256CanonicalJson(approval.binding) === proposal.bindingSha256;
    if (!bindingMatches) {
      return { status: "mismatch" };
    }
    const existing = this.#claimsByApproval.get(request.approvalId);
    if (existing) {
      return existing.claim.idempotencyKey === request.idempotencyKey
        ? { claim: existing.claim, retry: true, status: "claimed" }
        : { status: "replay" };
    }
    const claimId = claimIdentifier(
      "claim",
      request.approvalId,
      request.idempotencyKey
    );
    const claim: ExecutionClaim = Object.freeze({
      approvalId: request.approvalId,
      auditReceiptId: claimIdentifier(
        "audit",
        request.approvalId,
        request.idempotencyKey
      ),
      bindingSha256: request.bindingSha256,
      claimId,
      executionIntentId: claimIdentifier(
        "intent",
        request.approvalId,
        request.idempotencyKey
      ),
      idempotencyKey: request.idempotencyKey,
      outboxMessageId: claimIdentifier(
        "outbox",
        request.approvalId,
        request.idempotencyKey
      ),
      status: "pending",
    });
    const state: StoredExecutionState = {
      audit: {
        actorId: request.actorId,
        approvalId: request.approvalId,
        bindingSha256: request.bindingSha256,
        claimId: claim.claimId,
        decision: "allowed",
        executionIntentId: claim.executionIntentId,
        occurredAt: request.now.toISOString(),
        outboxMessageId: claim.outboxMessageId,
        reasonCode: request.auditReasonCode,
        resourceId: request.binding.resource.id,
        version: "v1",
      },
      claim,
      intent: { binding: request.binding, status: "pending" },
      outbox: { payload: request.binding, status: "pending" },
    };
    this.#claimsByApproval.set(request.approvalId, state);
    this.#claimsById.set(claimId, state);
    return { claim, retry: false, status: "claimed" };
  };

  completeExecution = (
    claimId: string,
    completion: ExecutionCompletion
  ): Promise<boolean> => {
    const state = this.#claimsById.get(claimId);
    if (!state) {
      return Promise.resolve(false);
    }
    if (state.completion) {
      return Promise.resolve(
        state.completion.outcome === completion.outcome &&
          state.completion.completedAt.getTime() ===
            completion.completedAt.getTime()
      );
    }
    state.completion = completion;
    state.intent = {
      ...state.intent,
      status: completion.outcome === "succeeded" ? "completed" : "failed",
    };
    state.outbox = { ...state.outbox, status: "delivered" };
    state.claim = { ...state.claim, status: "completed" };
    return Promise.resolve(true);
  };

  readExecutionState = (
    claimId: string
  ): Readonly<StoredExecutionState> | null => {
    const state = this.#claimsById.get(claimId);
    return state
      ? Object.freeze({
          audit: Object.freeze({ ...state.audit }),
          claim: Object.freeze({ ...state.claim }),
          completion: state.completion
            ? Object.freeze({ ...state.completion })
            : undefined,
          intent: Object.freeze({ ...state.intent }),
          outbox: Object.freeze({ ...state.outbox }),
        })
      : null;
  };
}
