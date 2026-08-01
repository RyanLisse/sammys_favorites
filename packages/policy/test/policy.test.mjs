import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_STAGE,
  DefaultPolicyEvaluator,
  InMemoryNonceStore,
  canonicalizeJson,
  sha256CanonicalJson,
} from "../dist/index.js";

const now = new Date("2026-08-01T12:00:00Z");
const evaluator = new DefaultPolicyEvaluator();

const binding = {
  actionType: "supplier.place-order",
  capability: "supplier.order.execute",
  payload: { quantity: 1, sku: "GOLD-42" },
  resource: {
    id: "GOLD-42",
    target: "supplier-1",
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
  const approval = {
    actorId: "ryan",
    approvedAt: "2026-08-01T11:59:00Z",
    binding: actionBinding,
    expiresAt: "2026-08-01T12:05:00Z",
    nonce: "one-time-nonce-123",
    proposalBindingSha256: bindingSha256,
    proposalId: proposal.id,
    proposalVersion: "v1",
    version: "v1",
  };
  return { approval, proposal };
};

const context = (overrides = {}) => ({
  actorId: "executor-1",
  authorizedApprovers: new Set(["ryan"]),
  grants: new Set(["supplier.order.execute"]),
  nonceStore: new InMemoryNonceStore(),
  now,
  principalKind: "service",
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
    "😀": "Emoji: Grinning Face",
    דּ: "Hebrew Letter Dalet With Dagesh",
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

test("denies unknown and generic ambient capabilities by default", async () => {
  for (const capability of ["future.magic", "sql"]) {
    const decision = await evaluator.evaluate(context(), {
      binding: { ...binding, capability },
    });
    assert.equal(
      decision.reasonCode,
      capability === "sql" ? "GENERIC_CAPABILITY_DENIED" : "UNKNOWN_CAPABILITY"
    );
  }
});

test("malformed and undefined action combinations fail closed", async () => {
  const undefinedBindingDecision = await evaluator.evaluate(context(), {
    binding: undefined,
  });
  assert.equal(undefinedBindingDecision.reasonCode, "INVALID_ACTION");
  const unknownFieldDecision = await evaluator.evaluate(context(), {
    binding: { ...binding, unexpectedAuthority: true },
  });
  assert.equal(unknownFieldDecision.reasonCode, "INVALID_ACTION");
});

test("every capability has exactly one allowed stage and all other stages deny", async () => {
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

  const webhookDecision = await evaluator.evaluate(
    context({ grants: new Set(["webhook.receive"]) }),
    {
      binding: { ...binding, capability: "webhook.receive", stage: "execute" },
      webhookSignatureVerified: true,
    }
  );
  assert.equal(webhookDecision.allowed, true);
});

test("never permits an agent to execute a privileged write", async () => {
  const decision = await evaluator.evaluate(
    context({ principalKind: "agent" }),
    {
      ...createEvidence(),
      binding,
    }
  );
  assert.deepEqual(decision, {
    allowed: false,
    reasonCode: "DIRECT_AGENT_EXECUTION_DENIED",
    requiredApproval: "human",
  });
});

test("atomically consumes approval nonce and rejects repeated execution", async () => {
  const executionContext = context();
  const action = { ...createEvidence(), binding };
  const firstExecution = await evaluator.evaluate(executionContext, action);
  assert.equal(firstExecution.allowed, true);
  const repeatedExecution = await evaluator.evaluate(executionContext, action);
  assert.equal(repeatedExecution.reasonCode, "REPLAY_DETECTED");
});

test("action-bound approval rejects every substitution dimension", async () => {
  const evidence = createEvidence();
  const substitutions = [
    { ...binding, actionType: "supplier.cancel-order" },
    { ...binding, capability: "commerce.workflow.execute" },
    { ...binding, payload: { quantity: 2, sku: "GOLD-42" } },
    { ...binding, resource: { ...binding.resource, id: "SILVER-7" } },
    { ...binding, resource: { ...binding.resource, target: "supplier-2" } },
    { ...binding, riskClass: "low" },
  ];
  for (const substitutedBinding of substitutions) {
    const decision = await evaluator.evaluate(
      context({
        grants: new Set([
          "supplier.order.execute",
          "commerce.workflow.execute",
        ]),
      }),
      { ...evidence, binding: substitutedBinding }
    );
    assert.equal(decision.reasonCode, "APPROVAL_MISMATCH");
  }

  const stageDecision = await evaluator.evaluate(context(), {
    ...evidence,
    binding: { ...binding, stage: "propose" },
  });
  assert.equal(stageDecision.reasonCode, "WRONG_STAGE");
});

test("requires an explicitly authorized approval actor", async () => {
  const decision = await evaluator.evaluate(
    context({ authorizedApprovers: new Set(["another-operator"]) }),
    { ...createEvidence(), binding }
  );
  assert.equal(decision.reasonCode, "APPROVER_NOT_AUTHORIZED");
});

test("blocks SSRF, forged webhooks, secrets, prompt injection, and kill switches", async () => {
  const cases = [
    [
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
        targetUrl: "http://169.254.169.254/latest",
      },
      "UNSAFE_TARGET",
    ],
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
