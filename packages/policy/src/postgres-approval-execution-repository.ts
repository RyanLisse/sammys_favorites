import type { Approval, Proposal } from "@sammys/contracts";
import { approvalSchema, proposalSchema } from "@sammys/contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { ApprovalVerifier } from "./approval-verifier.js";
import { sha256CanonicalJson } from "./canonical-json.js";
import type {
  ApprovalExecutionRepository,
  ExecutionClaim,
  ExecutionClaimRequest,
  ExecutionClaimResult,
  ExecutionCompletion,
  VerifiedApprovalRecord,
} from "./execution-approval-repository.js";

interface ApprovalRow extends QueryResultRow {
  readonly approval: Approval;
  readonly proposal: Proposal;
  readonly revision: string;
}

interface ClaimRow extends QueryResultRow {
  readonly approval_id: string;
  readonly audit_receipt_id: string;
  readonly binding_sha256: string;
  readonly claim_id: string;
  readonly completed_at: Date | null;
  readonly execution_intent_id: string;
  readonly idempotency_key: string;
  readonly outcome: "failed" | "succeeded" | null;
  readonly outbox_message_id: string;
  readonly status: "completed" | "pending";
}

const validateSchemaName = (schema: string): string => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error("Policy PostgreSQL schema name is invalid");
  }
  return schema;
};

const claimIdentifier = (
  prefix: string,
  approvalId: string,
  idempotencyKey: string
): string =>
  `${prefix}_${sha256CanonicalJson({ approvalId, idempotencyKey }).slice(0, 24)}`;

const toClaim = (row: ClaimRow): ExecutionClaim => ({
  approvalId: row.approval_id,
  auditReceiptId: row.audit_receipt_id,
  bindingSha256: row.binding_sha256,
  claimId: row.claim_id,
  executionIntentId: row.execution_intent_id,
  idempotencyKey: row.idempotency_key,
  outboxMessageId: row.outbox_message_id,
  status: row.status,
});

const bindingMatches = (
  request: ExecutionClaimRequest,
  row: ApprovalRow,
  approval: Approval,
  proposal: Proposal
): boolean =>
  row.revision === request.expectedRevision &&
  request.bindingSha256 === proposal.bindingSha256 &&
  sha256CanonicalJson(request.binding) === proposal.bindingSha256 &&
  sha256CanonicalJson(approval.binding) === proposal.bindingSha256;

const createClaim = (request: ExecutionClaimRequest): ExecutionClaim => ({
  approvalId: request.approvalId,
  auditReceiptId: claimIdentifier(
    "audit",
    request.approvalId,
    request.idempotencyKey
  ),
  bindingSha256: request.bindingSha256,
  claimId: claimIdentifier("claim", request.approvalId, request.idempotencyKey),
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

export class PostgresApprovalExecutionRepository implements ApprovalExecutionRepository {
  readonly #pool: Pool;
  readonly #schema: string;
  readonly #verifier: ApprovalVerifier;

  constructor(pool: Pool, schema: string, verifier: ApprovalVerifier) {
    this.#pool = pool;
    this.#schema = validateSchemaName(schema);
    this.#verifier = verifier;
  }

  initialize = async (): Promise<void> => {
    await this.#pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.#schema}"`);
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS "${this.#schema}".policy_approval_records (
        approval_id text PRIMARY KEY,
        approval jsonb NOT NULL,
        proposal jsonb NOT NULL,
        revision text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS policy_approval_records_nonce_unique
        ON "${this.#schema}".policy_approval_records ((approval->>'nonce'));
      CREATE TABLE IF NOT EXISTS "${this.#schema}".policy_execution_claims (
        claim_id text PRIMARY KEY,
        approval_id text NOT NULL UNIQUE REFERENCES "${this.#schema}".policy_approval_records(approval_id),
        idempotency_key text NOT NULL,
        binding_sha256 text NOT NULL,
        execution_intent_id text NOT NULL UNIQUE,
        outbox_message_id text NOT NULL UNIQUE,
        audit_receipt_id text NOT NULL UNIQUE,
        status text NOT NULL CHECK (status IN ('pending', 'completed')),
        outcome text CHECK (outcome IN ('failed', 'succeeded')),
        completed_at timestamptz,
        created_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "${this.#schema}".policy_execution_intents (
        execution_intent_id text PRIMARY KEY,
        claim_id text NOT NULL UNIQUE REFERENCES "${this.#schema}".policy_execution_claims(claim_id),
        binding jsonb NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed'))
      );
      CREATE TABLE IF NOT EXISTS "${this.#schema}".policy_execution_outbox (
        outbox_message_id text PRIMARY KEY,
        claim_id text NOT NULL UNIQUE REFERENCES "${this.#schema}".policy_execution_claims(claim_id),
        payload jsonb NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'delivered'))
      );
      CREATE TABLE IF NOT EXISTS "${this.#schema}".policy_execution_audit (
        audit_receipt_id text PRIMARY KEY,
        claim_id text NOT NULL UNIQUE REFERENCES "${this.#schema}".policy_execution_claims(claim_id),
        actor_id text NOT NULL,
        approval_id text NOT NULL,
        binding_sha256 text NOT NULL,
        reason_code text NOT NULL,
        resource_id text NOT NULL,
        occurred_at timestamptz NOT NULL
      )
    `);
  };

  storeVerifiedApproval = async (
    record: VerifiedApprovalRecord
  ): Promise<boolean> => {
    const approval = approvalSchema.parse(record.approval);
    const proposal = proposalSchema.parse(record.proposal);
    if (!(await this.#verifier.verify(approval))) {
      return false;
    }
    const result = await this.#pool.query(
      `INSERT INTO "${this.#schema}".policy_approval_records
       (approval_id, approval, proposal, revision)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)
       ON CONFLICT DO NOTHING`,
      [
        approval.approvalId,
        JSON.stringify(approval),
        JSON.stringify(proposal),
        record.revision,
      ]
    );
    return result.rowCount === 1;
  };

  getVerifiedApproval = async (
    approvalId: string
  ): Promise<VerifiedApprovalRecord | null> => {
    const result = await this.#pool.query<ApprovalRow>(
      `SELECT approval, proposal, revision
       FROM "${this.#schema}".policy_approval_records
       WHERE approval_id = $1`,
      [approvalId]
    );
    const [row] = result.rows;
    if (!row) {
      return null;
    }
    const approval = approvalSchema.parse(row.approval);
    if (!(await this.#verifier.verify(approval))) {
      return null;
    }
    return {
      approval,
      proposal: proposalSchema.parse(row.proposal),
      revision: row.revision,
    };
  };

  claimExecution = async (
    request: ExecutionClaimRequest
  ): Promise<ExecutionClaimResult> => {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.#claimInTransaction(client, request);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  #claimInTransaction = async (
    client: PoolClient,
    request: ExecutionClaimRequest
  ): Promise<ExecutionClaimResult> => {
    const approvalResult = await client.query<ApprovalRow>(
      `SELECT approval, proposal, revision
       FROM "${this.#schema}".policy_approval_records
       WHERE approval_id = $1 FOR UPDATE`,
      [request.approvalId]
    );
    const [approvalRow] = approvalResult.rows;
    if (!approvalRow) {
      return { status: "not-found" };
    }
    const approval = approvalSchema.parse(approvalRow.approval);
    const proposal = proposalSchema.parse(approvalRow.proposal);
    if (!(await this.#verifier.verify(approval))) {
      return { status: "provenance-invalid" };
    }
    if (!request.authorizedApprovers.has(approval.actorId)) {
      return { status: "unauthorized-actor" };
    }
    if (
      Date.parse(approval.expiresAt) <= request.now.getTime() ||
      Date.parse(proposal.expiresAt) <= request.now.getTime()
    ) {
      return { status: "expired" };
    }
    if (!bindingMatches(request, approvalRow, approval, proposal)) {
      return { status: "mismatch" };
    }
    const existingResult = await client.query<ClaimRow>(
      `SELECT * FROM "${this.#schema}".policy_execution_claims
       WHERE approval_id = $1`,
      [request.approvalId]
    );
    const [existing] = existingResult.rows;
    if (existing) {
      return existing.idempotency_key === request.idempotencyKey
        ? { claim: toClaim(existing), retry: true, status: "claimed" }
        : { status: "replay" };
    }
    const claim = createClaim(request);
    await this.#insertAtomicExecution(client, request, claim);
    return { claim, retry: false, status: "claimed" };
  };

  #insertAtomicExecution = async (
    client: PoolClient,
    request: ExecutionClaimRequest,
    claim: ExecutionClaim
  ): Promise<void> => {
    await client.query(
      `INSERT INTO "${this.#schema}".policy_execution_claims
       (claim_id, approval_id, idempotency_key, binding_sha256,
        execution_intent_id, outbox_message_id, audit_receipt_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
      [
        claim.claimId,
        claim.approvalId,
        claim.idempotencyKey,
        claim.bindingSha256,
        claim.executionIntentId,
        claim.outboxMessageId,
        claim.auditReceiptId,
        request.now,
      ]
    );
    await client.query(
      `INSERT INTO "${this.#schema}".policy_execution_intents
       (execution_intent_id, claim_id, binding, status)
       VALUES ($1, $2, $3::jsonb, 'pending')`,
      [claim.executionIntentId, claim.claimId, JSON.stringify(request.binding)]
    );
    await client.query(
      `INSERT INTO "${this.#schema}".policy_execution_outbox
       (outbox_message_id, claim_id, payload, status)
       VALUES ($1, $2, $3::jsonb, 'pending')`,
      [claim.outboxMessageId, claim.claimId, JSON.stringify(request.binding)]
    );
    await client.query(
      `INSERT INTO "${this.#schema}".policy_execution_audit
       (audit_receipt_id, claim_id, actor_id, approval_id, binding_sha256,
        reason_code, resource_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        claim.auditReceiptId,
        claim.claimId,
        request.actorId,
        request.approvalId,
        request.bindingSha256,
        request.auditReasonCode,
        request.binding.resource.id,
        request.now,
      ]
    );
  };

  completeExecution = async (
    claimId: string,
    completion: ExecutionCompletion
  ): Promise<boolean> => {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const claimResult = await client.query<ClaimRow>(
        `SELECT * FROM "${this.#schema}".policy_execution_claims
         WHERE claim_id = $1 FOR UPDATE`,
        [claimId]
      );
      const [claim] = claimResult.rows;
      if (!claim) {
        await client.query("ROLLBACK");
        return false;
      }
      if (claim.completed_at) {
        const isSameCompletion =
          claim.outcome === completion.outcome &&
          claim.completed_at.getTime() === completion.completedAt.getTime();
        await client.query("COMMIT");
        return isSameCompletion;
      }
      await client.query(
        `UPDATE "${this.#schema}".policy_execution_claims
         SET status = 'completed', outcome = $2, completed_at = $3
         WHERE claim_id = $1`,
        [claimId, completion.outcome, completion.completedAt]
      );
      await client.query(
        `UPDATE "${this.#schema}".policy_execution_intents
         SET status = $2 WHERE claim_id = $1`,
        [claimId, completion.outcome === "succeeded" ? "completed" : "failed"]
      );
      await client.query(
        `UPDATE "${this.#schema}".policy_execution_outbox
         SET status = 'delivered' WHERE claim_id = $1`,
        [claimId]
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}
