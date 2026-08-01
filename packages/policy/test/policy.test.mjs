import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_STAGE,
  DefaultPolicyEvaluator,
  HmacApprovalVerifier,
  InMemoryApprovalExecutionRepository,
  canonicalizeJson,
  createApprovalSignature,
  sha256CanonicalJson,
} from "../dist/index.js";

const now = new Date("2026-08-01T12:00:00Z");
const approvalKey = Buffer.from("phase-0-test-approval-key");
const evaluator = new DefaultPolicyEvaluator();

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

const createEvidence = (actionBinding = binding) => {
  const bindingSha256 = sha256CanonicalJson(actionBinding);
  const proposal = {
    binding: actionBinding,
    bindingSha256,
    createdAt: "2026-08-01T11:55:00Z",
    createdBy: "agent-1",
    expiresAt: "2026-08-01T12:10:00Z",
    id: "1454fd9c-b64b-45a5-a719-d562ccb73c4f",
    version: "v1",
  };
  const unsignedApproval = {
    actorId: "ryan",
    approvalId: "2454fd9c-b64b-45a5-a719-d562ccb73c4f",
    approvedAt: "2026-08-01T11:59:00Z",
    binding: actionBinding,
    expiresAt: "2026-08-01T12:05:00Z",
    nonce: "one-time-nonce-123",
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
  return { approval, proposal, revision: "approval-revision-1" };
};

const createRepository = (record = createEvidence()) =>
  new InMemoryApprovalExecutionRepository(
    [record],
    new HmacApprovalVerifier(new Map([["approval-key-1", approvalKey]]))
  );

const context = (overrides = {}) => ({
  actorId: "executor-1",
  approvalRepository: createRepository(),
  authorizedApprovers: new Set(["ryan"]),
  grants: new Set(["supplier.order.execute"]),
  now,
  principalKind: "service",
  ...overrides,
});

const approvedAction = (overrides = {}) => ({
  approvalId: "2454fd9c-b64b-45a5-a719-d562ccb73c4f",
  binding,
  idempotencyKey: "execution-attempt-1",
  ...overrides,
});

test("canonical JSON follows JCS number and Unicode-key ordering vectors", () => {
  assert.equal(
    canonicalizeJson({
      literals: [null, true, false],
      numbers: [Number("333333333.33333329"), 1e30, 4.5, 0.002, 1e-27],
      string: '€$\u000F\nA\'B"\\"/',
    }),
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\\"\\\\\\\"/"}'
  );
  assert.equal(canonicalizeJson(-0), "0");
  const ordered = canonicalizeJson({
    "\r": "Carriage Return",
    1: "One",
    "\u0080": "Control",
    ö: "Latin Small Letter O With Diaeresis",
    "€": "Euro Sign",
    דּ: "Hebrew Letter Dalet With Dagesh",
    "😀": "Emoji: Grinning Face",
  });
  const orderedKeys = ["\\r", "1", "", "ö", "€", "😀", "דּ"];
  for (let index = 1; index < orderedKeys.length; index += 1) {
    assert.ok(
      ordered.indexOf(`"${orderedKeys[index - 1]}"`) <
        ordered.indexOf(`"${orderedKeys[index]}"`)
    );
  }
});

test("canonical JSON rejects non-I-JSON lone surrogates", () => {
  assert.throws(() => canonicalizeJson("\uD800"), TypeError);
  assert.throws(() => canonicalizeJson({ "\uDC00": "bad-key" }), TypeError);
});

test("denies unknown, generic, and malformed actions by default", async () => {
  for (const capability of ["future.magic", "sql"]) {
    const decision = await evaluator.evaluate(context(), {
      binding: { ...binding, capability },
    });
    assert.equal(
      decision.reasonCode,
      capability === "sql" ? "GENERIC_CAPABILITY_DENIED" : "UNKNOWN_CAPABILITY"
    );
  }
  const malformed = await evaluator.evaluate(context(), { binding: undefined });
  assert.equal(malformed.reasonCode, "INVALID_ACTION");
});

test("every capability has exactly one allowed stage", async () => {
  const stages = ["read", "draft", "propose", "approve", "execute"];
  for (const [capability, expectedStage] of Object.entries(CAPABILITY_STAGE)) {
    for (const stage of stages) {
      if (stage === expectedStage) {
        continue;
      }
      const decision = await evaluator.evaluate(
        context({
          grants: new Set([capability]),
          principalKind:
            capability === "proposal.approve" ? "human" : "service",
        }),
        { binding: { ...binding, capability, stage } }
      );
      assert.equal(
        decision.reasonCode,
        "WRONG_STAGE",
        `${capability}/${stage}`
      );
    }
  }
});

test("derives outbound target validation from the bound target", async () => {
  const decision = await evaluator.evaluate(
    context({ grants: new Set(["supplier.quote.create"]) }),
    {
      binding: {
        ...binding,
        capability: "supplier.quote.create",
        resource: {
          ...binding.resource,
          target: "http://169.254.169.254/latest",
        },
        stage: "propose",
      },
    }
  );
  assert.equal(decision.reasonCode, "UNSAFE_TARGET");
});

test("never permits an agent to execute a privileged write", async () => {
  const decision = await evaluator.evaluate(
    context({ principalKind: "agent" }),
    approvedAction()
  );
  assert.equal(decision.reasonCode, "DIRECT_AGENT_EXECUTION_DENIED");
});

test("rejects caller-manufactured and invalidly signed approvals", async () => {
  const manufactured = await evaluator.evaluate(context(), {
    approval: createEvidence().approval,
    binding,
    proposal: createEvidence().proposal,
  });
  assert.equal(manufactured.reasonCode, "APPROVAL_REQUIRED");

  const evidence = createEvidence();
  const forgedRecord = {
    ...evidence,
    approval: { ...evidence.approval, actorId: "attacker" },
  };
  const forged = await evaluator.evaluate(
    context({ approvalRepository: createRepository(forgedRecord) }),
    approvedAction()
  );
  assert.equal(forged.reasonCode, "APPROVAL_NOT_VERIFIED");
});

test("atomically persists claim, intent, outbox, and audit with retry semantics", async () => {
  const concurrencyRepository = createRepository();
  const concurrencyContext = context({
    approvalRepository: concurrencyRepository,
  });
  const concurrentResults = await Promise.all([
    evaluator.evaluate(
      concurrencyContext,
      approvedAction({ idempotencyKey: "parallel-a" })
    ),
    evaluator.evaluate(
      concurrencyContext,
      approvedAction({ idempotencyKey: "parallel-b" })
    ),
  ]);
  assert.equal(concurrentResults.filter((result) => result.allowed).length, 1);
  assert.equal(
    concurrentResults.filter(
      (result) => result.reasonCode === "REPLAY_DETECTED"
    ).length,
    1
  );

  const repository = createRepository();
  const executionContext = context({ approvalRepository: repository });
  const first = await evaluator.evaluate(executionContext, approvedAction());
  assert.equal(first.allowed, true);
  assert.ok(first.executionClaim);
  const state = repository.readExecutionState(first.executionClaim.claimId);
  assert.equal(state?.intent.status, "pending");
  assert.equal(state?.outbox.status, "pending");
  assert.equal(state?.audit.reasonCode, "ALLOW");

  const retry = await evaluator.evaluate(executionContext, approvedAction());
  assert.equal(retry.allowed, true);
  assert.equal(retry.executionClaim?.claimId, first.executionClaim.claimId);
  const replay = await evaluator.evaluate(
    executionContext,
    approvedAction({ idempotencyKey: "different-attempt" })
  );
  assert.equal(replay.reasonCode, "REPLAY_DETECTED");

  const completion = {
    completedAt: new Date("2026-08-01T12:01:00Z"),
    outcome: "succeeded",
  };
  assert.equal(
    await repository.completeExecution(
      first.executionClaim.claimId,
      completion
    ),
    true
  );
  assert.equal(
    await repository.completeExecution(first.executionClaim.claimId, {
      ...completion,
      outcome: "failed",
    }),
    false
  );
  assert.equal(
    await repository.completeExecution(
      first.executionClaim.claimId,
      completion
    ),
    true
  );
  assert.equal(
    repository.readExecutionState(first.executionClaim.claimId)?.intent.status,
    "completed"
  );
});

test("action-bound approval rejects substitution and unauthorized actors", async () => {
  const substitutions = [
    { ...binding, actionType: "supplier.cancel-order" },
    { ...binding, payload: { quantity: 2, sku: "GOLD-42" } },
    { ...binding, resource: { ...binding.resource, id: "SILVER-7" } },
    { ...binding, riskClass: "low" },
  ];
  for (const substitutedBinding of substitutions) {
    const decision = await evaluator.evaluate(
      context(),
      approvedAction({ binding: substitutedBinding })
    );
    assert.equal(decision.reasonCode, "APPROVAL_MISMATCH");
  }
  const actorDecision = await evaluator.evaluate(
    context({ authorizedApprovers: new Set(["another-operator"]) }),
    approvedAction()
  );
  assert.equal(actorDecision.reasonCode, "APPROVER_NOT_AUTHORIZED");
});

test("blocks forged webhooks, secrets, prompt injection, and kill switches", async () => {
  const cases = [
    [
      context({ grants: new Set(["webhook.receive"]) }),
      { binding: { ...binding, capability: "webhook.receive" } },
      "UNTRUSTED_WEBHOOK",
    ],
    [context(), { binding, containsSecret: true }, "SECRET_IN_ACTION"],
    [
      context({ grants: new Set(["proposal.submit"]) }),
      {
        binding: {
          ...binding,
          capability: "proposal.submit",
          stage: "propose",
        },
        untrustedInstructions: true,
      },
      "PROMPT_INJECTION_RISK",
    ],
    [
      context({ killSwitches: new Set(["all-writes"]) }),
      { binding },
      "KILL_SWITCH_ACTIVE",
    ],
  ];
  for (const [policyContext, action, reason] of cases) {
    const decision = await evaluator.evaluate(policyContext, action);
    assert.equal(decision.reasonCode, reason);
  }
});
