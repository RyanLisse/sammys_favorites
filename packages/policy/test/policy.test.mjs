import assert from "node:assert/strict";
import test from "node:test";
import { promisify } from "node:util";

import {
  CAPABILITY_STAGE,
  DefaultPolicyEvaluator,
  DnsPinnedOutboundTargetVerifier,
  HmacApprovalVerifier,
  InMemoryApprovalExecutionRepository,
  InMemoryWebhookVerificationRepository,
  canonicalizeJson,
  createApprovalSignature,
  isPublicIpAddress,
  sha256CanonicalJson,
} from "../dist/index.js";

const now = new Date("2026-08-01T12:00:00Z");
const approvalKey = Buffer.from("phase-0-test-approval-key");
const evaluator = new DefaultPolicyEvaluator();

const outboundVerifier = (
  resolver = () =>
    Promise.resolve([
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ])
) =>
  new DnsPinnedOutboundTargetVerifier(
    new Map([
      ["supplier.order.execute", new Set(["https://api.supplier.example"])],
      ["supplier.quote.create", new Set(["https://api.supplier.example"])],
      ["supplier.snapshot.read", new Set(["https://api.supplier.example"])],
    ]),
    resolver
  );

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
  outboundTargetVerifier: outboundVerifier(),
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

test("pins outbound targets to provider origins and public IPv4/IPv6 DNS answers", async () => {
  const unsafeAnswers = [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.88.99.1",
    "::1",
    "0:0:0:0:0:0:0:1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "0:0:0:0:0:ffff:7f00:1",
    "2001::1",
    "2001:db8::1",
    "100::1",
    "2001:2::1",
    "2001:5::1",
    "2001:10::1",
    "2001:20::1",
    "2001:1ff:ffff::1",
    "2002::1",
    "64:ff9b:1::1",
    "3fff::1",
  ];
  for (const address of unsafeAnswers) {
    const decision = await evaluator.evaluate(
      context({
        grants: new Set(["supplier.quote.create"]),
        outboundTargetVerifier: outboundVerifier(() =>
          Promise.resolve([{ address, family: address.includes(":") ? 6 : 4 }])
        ),
      }),
      {
        binding: {
          ...binding,
          capability: "supplier.quote.create",
          stage: "propose",
        },
      }
    );
    assert.equal(decision.reasonCode, "UNSAFE_TARGET", address);
  }

  const mixedDns = await evaluator.evaluate(
    context({
      grants: new Set(["supplier.quote.create"]),
      outboundTargetVerifier: outboundVerifier(() =>
        Promise.resolve([
          { address: "8.8.8.8", family: 4 },
          { address: "fe80::1", family: 6 },
        ])
      ),
    }),
    {
      binding: {
        ...binding,
        capability: "supplier.quote.create",
        stage: "propose",
      },
    }
  );
  assert.equal(mixedDns.reasonCode, "UNSAFE_TARGET");

  for (const target of [
    "https://[::1]/orders",
    "https://169.254.169.254/latest",
    "https://attacker.example/orders",
  ]) {
    const decision = await evaluator.evaluate(
      context({ grants: new Set(["supplier.quote.create"]) }),
      {
        binding: {
          ...binding,
          capability: "supplier.quote.create",
          resource: { ...binding.resource, target },
          stage: "propose",
        },
      }
    );
    assert.equal(decision.reasonCode, "UNSAFE_TARGET", target);
  }

  const allowed = await evaluator.evaluate(
    context({ grants: new Set(["supplier.quote.create"]) }),
    {
      binding: {
        ...binding,
        capability: "supplier.quote.create",
        stage: "propose",
      },
    }
  );
  assert.equal(allowed.reasonCode, "ALLOW");
  assert.deepEqual(allowed.outboundConnectionPlan?.addresses, [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
  assert.equal(isPublicIpAddress("2001:200::1"), true);
  assert.equal(isPublicIpAddress("2001:4860:4860::8888"), true);
});

test("classifies every IPv4-mapped IPv6 spelling by its embedded IPv4 address", () => {
  const unsafeMappedAddresses = [
    "::ffff:127.0.0.1",
    "0:0:0:0:0:ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:10.0.0.1",
    "0:0:0:0:0:ffff:10.0.0.1",
    "::ffff:a00:1",
    "0:0:0:0:0:ffff:a00:1",
    "::ffff:169.254.169.254",
    "0:0:0:0:0:ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "0:0:0:0:0:ffff:a9fe:a9fe",
    "::ffff:192.0.2.1",
    "0:0:0:0:0:ffff:192.0.2.1",
    "::ffff:c000:201",
    "0:0:0:0:0:ffff:c000:201",
  ];
  for (const address of unsafeMappedAddresses) {
    assert.equal(isPublicIpAddress(address), false, address);
  }

  const publicMappedAddresses = [
    "::ffff:8.8.8.8",
    "0:0:0:0:0:ffff:8.8.8.8",
    "::ffff:808:808",
    "0:0:0:0:0:ffff:808:808",
  ];
  for (const address of publicMappedAddresses) {
    assert.equal(isPublicIpAddress(address), true, address);
  }
});

test("returns a connect-bound DNS plan and re-verifies every redirect", async () => {
  let resolverAnswers = [{ address: "8.8.8.8", family: 4 }];
  let resolutionCount = 0;
  const verifier = outboundVerifier(() => {
    resolutionCount += 1;
    return Promise.resolve(resolverAnswers);
  });
  const decision = await evaluator.evaluate(
    context({
      grants: new Set(["supplier.quote.create"]),
      outboundTargetVerifier: verifier,
    }),
    {
      binding: {
        ...binding,
        capability: "supplier.quote.create",
        stage: "propose",
      },
    }
  );
  assert.equal(decision.allowed, true);
  assert.ok(decision.outboundConnectionPlan);
  assert.equal(resolutionCount, 1);

  resolverAnswers = [{ address: "127.0.0.1", family: 4 }];
  const pinnedLookup = promisify(decision.outboundConnectionPlan.lookup);
  const pinnedResult = await pinnedLookup("api.supplier.example", {
    all: true,
  });
  assert.deepEqual(pinnedResult, [{ address: "8.8.8.8", family: 4 }]);
  assert.equal(resolutionCount, 1, "the connect lookup never resolves again");

  const redirectPlan = await decision.outboundConnectionPlan.verifyRedirect(
    "https://api.supplier.example/redirected"
  );
  assert.equal(redirectPlan, null);
  assert.equal(resolutionCount, 2, "redirects require fresh verification");
});

test("never permits an agent to execute a privileged write", async () => {
  const decision = await evaluator.evaluate(
    context({ principalKind: "agent" }),
    approvedAction()
  );
  assert.equal(decision.reasonCode, "DIRECT_AGENT_EXECUTION_DENIED");

  const webhookDecision = await evaluator.evaluate(
    context({ grants: new Set(["webhook.receive"]), principalKind: "agent" }),
    {
      binding: { ...binding, capability: "webhook.receive" },
    }
  );
  assert.equal(webhookDecision.reasonCode, "DIRECT_AGENT_EXECUTION_DENIED");
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

  for (const payload of [
    { nested: { api_key: "not-accepted" } },
    { values: ["Bearer abcdefghijklmnop"] },
    { note: "client_secret=abcdefghijkl" },
    { material: { privateKey: "redacted" } },
  ]) {
    const decision = await evaluator.evaluate(context(), {
      binding: { ...binding, payload },
    });
    assert.equal(decision.reasonCode, "SECRET_IN_ACTION");
  }

  for (const action of [
    approvedAction({ idempotencyKey: "Bearer abcdefghijklmnop" }),
    approvedAction({ approvalId: "api_key=abcdefghijkl" }),
    {
      binding: { ...binding, capability: "webhook.receive" },
      webhookVerificationReceiptId: "Bearer abcdefghijklmnop",
    },
  ]) {
    const decision = await evaluator.evaluate(
      context({ grants: new Set([action.binding.capability]) }),
      action
    );
    assert.equal(decision.reasonCode, "SECRET_IN_ACTION");
  }
});

test("accepts webhooks only through an immutable verification receipt lookup", async () => {
  const webhookBinding = { ...binding, capability: "webhook.receive" };
  const receipt = {
    bindingSha256: sha256CanonicalJson(webhookBinding),
    expiresAt: "2026-08-01T12:05:00Z",
    provider: "stripe",
    receiptId: "webhook-receipt-1",
    verifiedAt: "2026-08-01T11:59:00Z",
  };
  const webhookContext = context({
    expectedWebhookProvider: "stripe",
    grants: new Set(["webhook.receive"]),
    webhookVerificationRepository: new InMemoryWebhookVerificationRepository([
      receipt,
    ]),
  });
  const callerBoolean = await evaluator.evaluate(webhookContext, {
    binding: webhookBinding,
    webhookSignatureVerified: true,
  });
  assert.equal(callerBoolean.reasonCode, "UNTRUSTED_WEBHOOK");

  const altered = await evaluator.evaluate(webhookContext, {
    binding: {
      ...webhookBinding,
      payload: { forged: true },
    },
    webhookVerificationReceiptId: receipt.receiptId,
  });
  assert.equal(altered.reasonCode, "UNTRUSTED_WEBHOOK");

  const verified = await evaluator.evaluate(webhookContext, {
    binding: webhookBinding,
    webhookVerificationReceiptId: receipt.receiptId,
  });
  assert.equal(verified.reasonCode, "ALLOW");

  const replay = await evaluator.evaluate(webhookContext, {
    binding: webhookBinding,
    webhookVerificationReceiptId: receipt.receiptId,
  });
  assert.equal(replay.reasonCode, "UNTRUSTED_WEBHOOK");
});

test("atomically consumes provider-bound webhook receipts and rejects invalid dates", async () => {
  const webhookBinding = { ...binding, capability: "webhook.receive" };
  const receipt = {
    bindingSha256: sha256CanonicalJson(webhookBinding),
    expiresAt: "2026-08-01T12:05:00Z",
    provider: "stripe",
    receiptId: "webhook-receipt-concurrent",
    verifiedAt: "2026-08-01T11:59:00Z",
  };
  const repository = new InMemoryWebhookVerificationRepository([receipt]);
  const webhookContext = context({
    expectedWebhookProvider: "stripe",
    grants: new Set(["webhook.receive"]),
    webhookVerificationRepository: repository,
  });
  const results = await Promise.all([
    evaluator.evaluate(webhookContext, {
      binding: webhookBinding,
      webhookVerificationReceiptId: receipt.receiptId,
    }),
    evaluator.evaluate(webhookContext, {
      binding: webhookBinding,
      webhookVerificationReceiptId: receipt.receiptId,
    }),
  ]);
  assert.equal(results.filter(({ allowed }) => allowed).length, 1);
  assert.equal(
    results.filter(({ reasonCode }) => reasonCode === "UNTRUSTED_WEBHOOK")
      .length,
    1
  );

  for (const invalidReceipt of [
    { ...receipt, receiptId: "wrong-provider" },
    {
      ...receipt,
      expiresAt: "not-a-date",
      receiptId: "invalid-expiry",
    },
    {
      ...receipt,
      receiptId: "invalid-verified-at",
      verifiedAt: "not-a-date",
    },
  ]) {
    const invalidRepository = new InMemoryWebhookVerificationRepository([
      invalidReceipt,
    ]);
    const invalidContext = context({
      expectedWebhookProvider:
        invalidReceipt.receiptId === "wrong-provider" ? "meta" : "stripe",
      grants: new Set(["webhook.receive"]),
      webhookVerificationRepository: invalidRepository,
    });
    const decision = await evaluator.evaluate(invalidContext, {
      binding: webhookBinding,
      webhookVerificationReceiptId: invalidReceipt.receiptId,
    });
    assert.equal(decision.reasonCode, "UNTRUSTED_WEBHOOK");
  }
});

test("does not consume a webhook receipt until non-mutating checks pass", async () => {
  const webhookBinding = { ...binding, capability: "webhook.receive" };
  const receipt = {
    bindingSha256: sha256CanonicalJson(webhookBinding),
    expiresAt: "2026-08-01T12:05:00Z",
    provider: "stripe",
    receiptId: "webhook-receipt-retry",
    verifiedAt: "2026-08-01T11:59:00Z",
  };
  const webhookContext = context({
    expectedWebhookProvider: "stripe",
    grants: new Set(["webhook.receive"]),
    webhookVerificationRepository: new InMemoryWebhookVerificationRepository([
      receipt,
    ]),
  });
  const denied = await evaluator.evaluate(webhookContext, {
    binding: webhookBinding,
    untrustedInstructions: true,
    webhookVerificationReceiptId: receipt.receiptId,
  });
  assert.equal(denied.reasonCode, "PROMPT_INJECTION_RISK");
  const corrected = await evaluator.evaluate(webhookContext, {
    binding: webhookBinding,
    webhookVerificationReceiptId: receipt.receiptId,
  });
  assert.equal(corrected.reasonCode, "ALLOW");
});
