import assert from "node:assert/strict";
import test from "node:test";

import { Pool } from "pg";

import {
  DefaultPolicyEvaluator,
  DnsPinnedOutboundTargetVerifier,
  HmacApprovalVerifier,
  PostgresApprovalExecutionRepository,
  createApprovalSignature,
  sha256CanonicalJson,
} from "../dist/index.js";

const databaseUrl = process.env.POLICY_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest(
  "persists an atomic approval claim across repository and pool restarts",
  async () => {
    const schema = `policy_test_${process.pid}`;
    const approvalKey = Buffer.from("phase-0-postgres-test-approval-key");
    const binding = {
      actionType: "supplier.place-order",
      capability: "supplier.order.execute",
      payload: { quantity: 1, sku: "GOLD-42" },
      resource: {
        id: "GOLD-42",
        target: "https://api.supplier.example/orders",
        type: "supplier-sku",
      },
      riskClass: "high",
      stage: "execute",
    };
    const bindingSha256 = sha256CanonicalJson(binding);
    const proposal = {
      binding,
      bindingSha256,
      createdAt: "2026-08-01T11:55:00Z",
      createdBy: "agent-1",
      expiresAt: "2026-08-01T12:10:00Z",
      id: "3454fd9c-b64b-45a5-a719-d562ccb73c4f",
      version: "v1",
    };
    const unsignedApproval = {
      actorId: "ryan",
      approvalId: "4454fd9c-b64b-45a5-a719-d562ccb73c4f",
      approvedAt: "2026-08-01T11:59:00Z",
      binding,
      expiresAt: "2026-08-01T12:05:00Z",
      nonce: "postgres-restart-nonce-123",
      proposalBindingSha256: bindingSha256,
      proposalId: proposal.id,
      proposalVersion: "v1",
      provenance: {
        issuer: "operator-console",
        keyId: "approval-key-1",
        signature: "0".repeat(64),
      },
      version: "v1",
    };
    const approval = {
      ...unsignedApproval,
      provenance: {
        ...unsignedApproval.provenance,
        signature: createApprovalSignature(unsignedApproval, approvalKey),
      },
    };
    const verifier = new HmacApprovalVerifier(
      new Map([["approval-key-1", approvalKey]])
    );
    const firstPool = new Pool({ connectionString: databaseUrl });
    try {
      const repository = new PostgresApprovalExecutionRepository(
        firstPool,
        schema,
        verifier
      );
      await repository.initialize();
      assert.equal(
        await repository.storeVerifiedApproval({
          approval,
          proposal,
          revision: "postgres-revision-1",
        }),
        true
      );
      const reusedNonceUnsigned = {
        ...unsignedApproval,
        approvalId: "5454fd9c-b64b-45a5-a719-d562ccb73c4f",
      };
      const reusedNonceApproval = {
        ...reusedNonceUnsigned,
        provenance: {
          ...reusedNonceUnsigned.provenance,
          signature: createApprovalSignature(reusedNonceUnsigned, approvalKey),
        },
      };
      assert.equal(
        await repository.storeVerifiedApproval({
          approval: reusedNonceApproval,
          proposal,
          revision: "postgres-revision-reused-nonce",
        }),
        false
      );
      const evaluator = new DefaultPolicyEvaluator();
      const first = await evaluator.evaluate(
        {
          actorId: "executor-1",
          approvalRepository: repository,
          authorizedApprovers: new Set(["ryan"]),
          grants: new Set(["supplier.order.execute"]),
          now: new Date("2026-08-01T12:00:00Z"),
          outboundTargetVerifier: new DnsPinnedOutboundTargetVerifier(
            new Map([
              [
                "supplier.order.execute",
                new Set(["https://api.supplier.example"]),
              ],
            ]),
            () => Promise.resolve([{ address: "8.8.8.8", family: 4 }])
          ),
          principalKind: "service",
        },
        {
          approvalId: approval.approvalId,
          binding,
          idempotencyKey: "durable-attempt-1",
        }
      );
      assert.equal(first.allowed, true);
      assert.ok(first.executionClaim);
    } finally {
      await firstPool.end();
    }

    const restartedPool = new Pool({ connectionString: databaseUrl });
    try {
      const restartedRepository = new PostgresApprovalExecutionRepository(
        restartedPool,
        schema,
        verifier
      );
      const record = await restartedRepository.getVerifiedApproval(
        approval.approvalId
      );
      assert.ok(record);
      const replay = await restartedRepository.claimExecution({
        actorId: "executor-2",
        approvalId: approval.approvalId,
        auditReasonCode: "ALLOW",
        authorizedApprovers: new Set(["ryan"]),
        binding,
        bindingSha256,
        expectedRevision: record.revision,
        idempotencyKey: "different-after-restart",
        now: new Date("2026-08-01T12:00:01Z"),
      });
      assert.equal(replay.status, "replay");

      const persisted = await restartedPool.query(
        `SELECT
           (SELECT count(*) FROM "${schema}".policy_execution_claims) AS claims,
           (SELECT count(*) FROM "${schema}".policy_execution_intents) AS intents,
           (SELECT count(*) FROM "${schema}".policy_execution_outbox) AS outbox,
           (SELECT count(*) FROM "${schema}".policy_execution_audit) AS audits`
      );
      assert.deepEqual(persisted.rows[0], {
        audits: "1",
        claims: "1",
        intents: "1",
        outbox: "1",
      });
    } finally {
      await restartedPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await restartedPool.end();
    }
  }
);
