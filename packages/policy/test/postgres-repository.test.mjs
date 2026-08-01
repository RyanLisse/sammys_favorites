import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  HmacApprovalVerifier,
  PostgresApprovalExecutionRepository,
  createApprovalSignature,
  sha256CanonicalJson,
} from "../dist/index.js";
import {
  POLICY_INTERNAL_FK_TRIGGERS,
  POLICY_SCHEMA_COLUMNS,
  POLICY_SCHEMA_CONSTRAINTS,
  POLICY_SCHEMA_INDEXES,
  POLICY_SCHEMA_MIGRATIONS,
  POLICY_SCHEMA_OWNER_PRIVILEGES,
  POLICY_SCHEMA_RELATIONS,
  POLICY_TABLE_OWNER_PRIVILEGES,
} from "../dist/postgres-policy-migrations.js";

const databaseUrl = process.env.POLICY_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;
const approvalKey = Buffer.from("phase-0-postgres-test-approval-key");
const verifier = new HmacApprovalVerifier(
  new Map([["approval-key-1", approvalKey]])
);
const now = new Date("2026-08-01T12:00:00Z");

const createSchema = () =>
  `policy_test_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

const createFixture = (label) => {
  const binding = {
    actionType: "supplier.place-order",
    capability: "supplier.order.execute",
    payload: { quantity: 1, sku: `GOLD-${label}` },
    resource: {
      id: `GOLD-${label}`,
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
    id: randomUUID(),
    version: "v1",
  };
  const unsignedApproval = {
    actorId: "ryan",
    approvalId: randomUUID(),
    approvedAt: "2026-08-01T11:59:00Z",
    binding,
    expiresAt: "2026-08-01T12:05:00Z",
    nonce: `postgres-nonce-${label}-${randomUUID()}`,
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
  return {
    binding,
    bindingSha256,
    record: { approval, proposal, revision: `revision-${label}` },
  };
};

const claimRequest = (fixture, idempotencyKey) => ({
  actorId: "executor-1",
  approvalId: fixture.record.approval.approvalId,
  auditReasonCode: "ALLOW",
  authorizedApprovers: new Set(["ryan"]),
  binding: fixture.binding,
  bindingSha256: fixture.bindingSha256,
  expectedRevision: fixture.record.revision,
  idempotencyKey,
  now,
});

const dropSchema = async (pool, schema) => {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
};

const createLegacySchema = async (pool, schema) => {
  await pool.query(`
    CREATE SCHEMA "${schema}";
    CREATE TABLE "${schema}".policy_approval_records (
      approval_id text PRIMARY KEY,
      approval jsonb NOT NULL,
      proposal jsonb NOT NULL,
      revision text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX policy_approval_records_nonce_unique
      ON "${schema}".policy_approval_records ((approval->>'nonce'));
    CREATE TABLE "${schema}".policy_execution_claims (
      claim_id text PRIMARY KEY,
      approval_id text NOT NULL UNIQUE REFERENCES "${schema}".policy_approval_records(approval_id),
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
    CREATE TABLE "${schema}".policy_execution_intents (
      execution_intent_id text PRIMARY KEY,
      claim_id text NOT NULL UNIQUE REFERENCES "${schema}".policy_execution_claims(claim_id),
      binding jsonb NOT NULL,
      status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed'))
    );
    CREATE TABLE "${schema}".policy_execution_outbox (
      outbox_message_id text PRIMARY KEY,
      claim_id text NOT NULL UNIQUE REFERENCES "${schema}".policy_execution_claims(claim_id),
      payload jsonb NOT NULL,
      status text NOT NULL CHECK (status IN ('pending', 'delivered'))
    );
    CREATE TABLE "${schema}".policy_execution_audit (
      audit_receipt_id text PRIMARY KEY,
      claim_id text NOT NULL UNIQUE REFERENCES "${schema}".policy_execution_claims(claim_id),
      actor_id text NOT NULL,
      approval_id text NOT NULL,
      binding_sha256 text NOT NULL,
      reason_code text NOT NULL,
      resource_id text NOT NULL,
      occurred_at timestamptz NOT NULL
    )
  `);
};

const splitPrefix = (value, prefixLength) => {
  const fields = value.split(":");
  return [
    ...fields.slice(0, prefixLength),
    fields.slice(prefixLength).join(":"),
  ];
};

const fingerprintResult = (sql) => {
  if (sql.includes("FROM pg_namespace AS namespace")) {
    return {
      rows: [
        {
          object_name: "policy_test_cleanup",
          owner_matches: true,
          owner_privileges: POLICY_SCHEMA_OWNER_PRIVILEGES,
          unexpected_acl_entries: "0",
        },
      ],
    };
  }
  if (sql.includes("aclexplode") && sql.includes("FROM pg_class AS relation")) {
    return {
      rows: Object.keys(POLICY_SCHEMA_COLUMNS).map((object_name) => ({
        object_name,
        owner_matches: true,
        owner_privileges: POLICY_TABLE_OWNER_PRIVILEGES,
        unexpected_acl_entries: "0",
      })),
    };
  }
  if (sql.includes("SELECT relation.relkind")) {
    return {
      rows: POLICY_SCHEMA_RELATIONS.map((relation) => {
        const [
          relkind,
          relpersistence,
          relname,
          relrowsecurity,
          relforcerowsecurity,
          owner_matches,
        ] = relation.split(":");
        return {
          owner_matches: owner_matches === "true",
          relforcerowsecurity: relforcerowsecurity === "true",
          relkind,
          relname,
          relpersistence,
          relrowsecurity: relrowsecurity === "true",
        };
      }),
    };
  }
  if (sql.includes("FROM information_schema.columns")) {
    return {
      rows: Object.entries(POLICY_SCHEMA_COLUMNS).map(
        ([table_name, columns]) => ({ columns, table_name })
      ),
    };
  }
  if (sql.includes("FROM pg_constraint AS constraint_record")) {
    return {
      rows: POLICY_SCHEMA_CONSTRAINTS.map((constraint) => {
        const [table_name, contype, conname, definition] = splitPrefix(
          constraint,
          3
        );
        return { conname, contype, definition, table_name };
      }),
    };
  }
  if (sql.includes("FROM pg_index AS index")) {
    return {
      rows: POLICY_SCHEMA_INDEXES.map((index) => {
        const [
          table_name,
          index_name,
          relpersistence,
          owner_matches,
          indisunique,
          indisvalid,
          indisready,
          definition,
        ] = splitPrefix(index, 7);
        return {
          definition,
          index_name,
          indisready: indisready === "true",
          indisunique: indisunique === "true",
          indisvalid: indisvalid === "true",
          owner_matches: owner_matches === "true",
          relpersistence,
          table_name,
        };
      }),
    };
  }
  if (sql.includes("WHERE constraint_namespace.nspname")) {
    return {
      rows: POLICY_INTERNAL_FK_TRIGGERS.map((trigger) => {
        const [conname, trigger_count, all_enabled] = trigger.split(":");
        return {
          all_enabled: all_enabled === "true",
          conname,
          trigger_count,
        };
      }),
    };
  }
  return { rows: [] };
};

const createInitializeFailureFixture = (failurePoint) => {
  const calls = [];
  const releases = [];
  const operationError = new Error(`${failurePoint} rejected`);
  const primaryOperationError =
    failurePoint === "rollback" || failurePoint === "operation-unlock-throw"
      ? new Error("operation rejected")
      : operationError;
  const client = {
    query: (sql) => {
      calls.push(sql);
      if (
        (failurePoint === "lock" && sql.includes("pg_advisory_lock")) ||
        (failurePoint === "begin" && sql === "BEGIN") ||
        (failurePoint === "commit" && sql === "COMMIT") ||
        (failurePoint === "rollback" && sql === "ROLLBACK") ||
        (failurePoint === "unlock" && sql.includes("pg_advisory_unlock")) ||
        (failurePoint === "operation" && sql.startsWith("CREATE SCHEMA"))
      ) {
        throw operationError;
      }
      if (
        (failurePoint === "rollback" ||
          failurePoint === "operation-unlock-false" ||
          failurePoint === "operation-unlock-throw") &&
        sql.startsWith("CREATE SCHEMA")
      ) {
        throw primaryOperationError;
      }
      if (sql.includes("pg_advisory_unlock")) {
        if (failurePoint === "operation-unlock-throw") {
          throw operationError;
        }
        return {
          rows: [{ unlocked: failurePoint !== "operation-unlock-false" }],
        };
      }
      if (sql.includes('FROM "policy_test_cleanup".policy_schema_migrations')) {
        return { rows: POLICY_SCHEMA_MIGRATIONS };
      }
      return fingerprintResult(sql);
    },
    release: (destroy) => {
      releases.push(destroy === true ? "destroy" : "release");
    },
  };
  const pool = { connect: () => client };
  return {
    calls,
    operationError,
    primaryOperationError,
    releases,
    repository: new PostgresApprovalExecutionRepository(
      pool,
      "policy_test_cleanup",
      verifier
    ),
  };
};

for (const failurePoint of ["lock", "begin", "commit", "rollback", "unlock"]) {
  test(`destroys an initialize client when ${failurePoint} is indeterminate`, async () => {
    const fixture = createInitializeFailureFixture(failurePoint);
    await (failurePoint === "rollback"
      ? assert.rejects(fixture.repository.initialize(), (error) => {
          assert.ok(error instanceof AggregateError);
          assert.deepEqual(error.errors, [
            fixture.primaryOperationError,
            fixture.operationError,
          ]);
          return true;
        })
      : assert.rejects(
          fixture.repository.initialize(),
          fixture.operationError
        ));
    assert.deepEqual(fixture.releases, ["destroy"]);
  });
}

test("aggregates an operation error with a determinate unlock failure", async () => {
  const fixture = createInitializeFailureFixture("operation-unlock-false");
  await assert.rejects(fixture.repository.initialize(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], fixture.primaryOperationError);
    assert.match(error.errors[1].message, /advisory lock release failed/u);
    return true;
  });
  assert.deepEqual(fixture.releases, ["destroy"]);
});

test("aggregates an operation error with a thrown unlock failure", async () => {
  const fixture = createInitializeFailureFixture("operation-unlock-throw");
  await assert.rejects(fixture.repository.initialize(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [
      fixture.primaryOperationError,
      fixture.operationError,
    ]);
    return true;
  });
  assert.deepEqual(fixture.releases, ["destroy"]);
});

test("unlocks and normally releases initialize clients on determinate paths", async () => {
  for (const failurePoint of ["none", "operation"]) {
    const fixture = createInitializeFailureFixture(failurePoint);
    if (failurePoint === "operation") {
      await assert.rejects(
        fixture.repository.initialize(),
        fixture.operationError
      );
      assert.ok(fixture.calls.includes("ROLLBACK"));
    } else {
      await fixture.repository.initialize();
    }
    assert.ok(fixture.calls.some((sql) => sql.includes("pg_advisory_unlock")));
    assert.deepEqual(fixture.releases, ["release"]);
  }
});

const createTransactionFailureFixture = (operation, failurePoint) => {
  const calls = [];
  const releases = [];
  const cleanupError = new Error(`${operation} ${failurePoint} rejected`);
  const primaryError = new Error(`${operation} operation rejected`);
  const completedAt = new Date("2026-08-01T12:01:00Z");
  const client = {
    query: (sql) => {
      calls.push(sql);
      if (
        (failurePoint === "begin" && sql === "BEGIN") ||
        (failurePoint === "commit" && sql === "COMMIT") ||
        (failurePoint === "rollback" && sql === "ROLLBACK")
      ) {
        throw cleanupError;
      }
      const isOperationQuery =
        sql.includes("FOR UPDATE") &&
        sql.includes(
          operation === "claim" ? "WHERE approval_id" : "WHERE claim_id"
        );
      if (
        isOperationQuery &&
        (failurePoint === "operation" || failurePoint === "rollback")
      ) {
        throw primaryError;
      }
      if (isOperationQuery && operation === "completion") {
        return failurePoint === "commit"
          ? { rows: [{ completed_at: completedAt, outcome: "succeeded" }] }
          : { rows: [] };
      }
      return { rows: [] };
    },
    release: (destroy) => {
      releases.push(destroy === true ? "destroy" : "release");
    },
  };
  const repository = new PostgresApprovalExecutionRepository(
    { connect: () => client },
    "policy_test_transaction_cleanup",
    verifier
  );
  const invoke = () =>
    operation === "claim"
      ? repository.claimExecution(
          claimRequest(createFixture("transaction-cleanup"), "cleanup-key")
        )
      : repository.completeExecution("claim-cleanup", {
          completedAt,
          outcome: "succeeded",
        });
  return { calls, cleanupError, invoke, primaryError, releases };
};

for (const operation of ["claim", "completion"]) {
  for (const failurePoint of ["begin", "commit", "rollback"]) {
    test(`destroys ${operation} clients when ${failurePoint} is indeterminate`, async () => {
      const fixture = createTransactionFailureFixture(operation, failurePoint);
      await (failurePoint === "rollback"
        ? assert.rejects(fixture.invoke(), (error) => {
            assert.ok(error instanceof AggregateError);
            assert.deepEqual(error.errors, [
              fixture.primaryError,
              fixture.cleanupError,
            ]);
            return true;
          })
        : assert.rejects(fixture.invoke(), fixture.cleanupError));
      assert.deepEqual(fixture.releases, ["destroy"]);
    });
  }

  test(`${operation} normally releases determinate success and error paths`, async () => {
    const normalFixture = createTransactionFailureFixture(operation, "none");
    const result = await normalFixture.invoke();
    assert.deepEqual(
      result,
      operation === "claim" ? { status: "not-found" } : false
    );
    assert.deepEqual(normalFixture.releases, ["release"]);

    const errorFixture = createTransactionFailureFixture(
      operation,
      "operation"
    );
    await assert.rejects(errorFixture.invoke(), errorFixture.primaryError);
    assert.ok(errorFixture.calls.includes("ROLLBACK"));
    assert.deepEqual(errorFixture.releases, ["release"]);
  });
}

integrationTest(
  "safely adopts an exact seeded legacy schema without losing data",
  async () => {
    const schema = createSchema();
    const fixture = createFixture("legacy");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await createLegacySchema(pool, schema);
      await pool.query(
        `INSERT INTO "${schema}".policy_approval_records
         (approval_id, approval, proposal, revision)
         VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
        [
          fixture.record.approval.approvalId,
          JSON.stringify(fixture.record.approval),
          JSON.stringify(fixture.record.proposal),
          fixture.record.revision,
        ]
      );
      const repository = new PostgresApprovalExecutionRepository(
        pool,
        schema,
        verifier
      );
      await repository.initialize();
      const record = await repository.getVerifiedApproval(
        fixture.record.approval.approvalId
      );
      assert.equal(record?.revision, fixture.record.revision);
      const migrationState = await pool.query(
        `SELECT version, name FROM "${schema}".policy_schema_migrations`
      );
      assert.deepEqual(migrationState.rows, [
        { name: "initial_policy_execution_schema", version: 1 },
      ]);
    } finally {
      await dropSchema(pool, schema);
      await pool.end();
    }
  }
);

integrationTest(
  "refuses to adopt a drifted legacy schema and preserves its existing data",
  async () => {
    const schema = createSchema();
    const fixture = createFixture("legacy-drift");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await createLegacySchema(pool, schema);
      await pool.query(
        `INSERT INTO "${schema}".policy_approval_records
         (approval_id, approval, proposal, revision)
         VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
        [
          fixture.record.approval.approvalId,
          JSON.stringify(fixture.record.approval),
          JSON.stringify(fixture.record.proposal),
          fixture.record.revision,
        ]
      );
      await pool.query(
        `ALTER TABLE "${schema}".policy_approval_records ADD COLUMN unsafe_legacy_data text`
      );
      const repository = new PostgresApprovalExecutionRepository(
        pool,
        schema,
        verifier
      );
      await assert.rejects(repository.initialize(), /column drift detected/u);
      const preserved = await pool.query(
        `SELECT revision FROM "${schema}".policy_approval_records WHERE approval_id = $1`,
        [fixture.record.approval.approvalId]
      );
      assert.equal(preserved.rows[0].revision, fixture.record.revision);
      const ledger = await pool.query(`SELECT to_regclass($1) AS ledger`, [
        `${schema}.policy_schema_migrations`,
      ]);
      assert.equal(ledger.rows[0].ledger, null);
    } finally {
      await dropSchema(pool, schema);
      await pool.end();
    }
  }
);

integrationTest(
  "serializes concurrent first initialization before schema creation",
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 10 });
    const schemas = Array.from({ length: 20 }, () => createSchema());
    try {
      for (const schema of schemas) {
        const initializers = Array.from(
          { length: 8 },
          () => new PostgresApprovalExecutionRepository(pool, schema, verifier)
        );
        const results = await Promise.allSettled(
          initializers.map((repository) => repository.initialize())
        );
        assert.equal(
          results.filter(({ status }) => status === "fulfilled").length,
          8,
          schema
        );
        const migrations = await pool.query(
          `SELECT count(*) AS count FROM "${schema}".policy_schema_migrations`
        );
        assert.equal(migrations.rows[0].count, "1");
      }
    } finally {
      for (const schema of schemas) {
        await dropSchema(pool, schema);
      }
      await pool.end();
    }
  }
);

integrationTest(
  "serializes concurrent claims and preserves retry/replay semantics across restart",
  async () => {
    const schema = createSchema();
    const fixture = createFixture("concurrency");
    const firstPool = new Pool({ connectionString: databaseUrl });
    let winningKey;
    try {
      const repository = new PostgresApprovalExecutionRepository(
        firstPool,
        schema,
        verifier
      );
      await repository.initialize();
      assert.equal(
        await repository.storeVerifiedApproval(fixture.record),
        true
      );
      const reusedNonceFixture = createFixture("reused-nonce");
      const reusedNonceUnsigned = {
        ...reusedNonceFixture.record.approval,
        nonce: fixture.record.approval.nonce,
        provenance: {
          ...reusedNonceFixture.record.approval.provenance,
          signature: "0".repeat(64),
        },
      };
      const reusedNonceRecord = {
        ...reusedNonceFixture.record,
        approval: {
          ...reusedNonceUnsigned,
          provenance: {
            ...reusedNonceUnsigned.provenance,
            signature: createApprovalSignature(
              reusedNonceUnsigned,
              approvalKey
            ),
          },
        },
      };
      assert.equal(
        await repository.storeVerifiedApproval(reusedNonceRecord),
        false
      );
      const keys = ["parallel-a", "parallel-b"];
      const results = await Promise.all(
        keys.map((key) => repository.claimExecution(claimRequest(fixture, key)))
      );
      const winner = results.find(({ status }) => status === "claimed");
      assert.ok(winner);
      winningKey = winner.claim.idempotencyKey;
      assert.equal(
        results.filter(({ status }) => status === "claimed").length,
        1
      );
      assert.equal(
        results.filter(({ status }) => status === "replay").length,
        1
      );
    } finally {
      await firstPool.end();
    }

    const restartedPool = new Pool({ connectionString: databaseUrl });
    try {
      const repository = new PostgresApprovalExecutionRepository(
        restartedPool,
        schema,
        verifier
      );
      await repository.initialize();
      const retry = await repository.claimExecution(
        claimRequest(fixture, winningKey)
      );
      assert.equal(retry.status, "claimed");
      assert.equal(retry.retry, true);
      const replay = await repository.claimExecution(
        claimRequest(fixture, "different-after-restart")
      );
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
      await dropSchema(restartedPool, schema);
      await restartedPool.end();
    }
  }
);

integrationTest(
  "makes completion idempotent and rejects a conflicting completion",
  async () => {
    const schema = createSchema();
    const fixture = createFixture("completion");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const repository = new PostgresApprovalExecutionRepository(
        pool,
        schema,
        verifier
      );
      await repository.initialize();
      await repository.storeVerifiedApproval(fixture.record);
      const result = await repository.claimExecution(
        claimRequest(fixture, "completion-key")
      );
      assert.equal(result.status, "claimed");
      const completion = {
        completedAt: new Date("2026-08-01T12:01:00Z"),
        outcome: "succeeded",
      };
      assert.equal(
        await repository.completeExecution(result.claim.claimId, completion),
        true
      );
      assert.equal(
        await repository.completeExecution(result.claim.claimId, completion),
        true
      );
      assert.equal(
        await repository.completeExecution(result.claim.claimId, {
          ...completion,
          outcome: "failed",
        }),
        false
      );
      const state = await pool.query(
        `SELECT claim.status, claim.outcome, intent.status AS intent_status,
                outbox.status AS outbox_status
         FROM "${schema}".policy_execution_claims AS claim
         JOIN "${schema}".policy_execution_intents AS intent USING (claim_id)
         JOIN "${schema}".policy_execution_outbox AS outbox USING (claim_id)`
      );
      assert.deepEqual(state.rows[0], {
        intent_status: "completed",
        outbox_status: "delivered",
        outcome: "succeeded",
        status: "completed",
      });
    } finally {
      await dropSchema(pool, schema);
      await pool.end();
    }
  }
);

integrationTest(
  "rolls back claim, intent, outbox, and audit as one atomic unit",
  async () => {
    const schema = createSchema();
    const fixture = createFixture("rollback");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const repository = new PostgresApprovalExecutionRepository(
        pool,
        schema,
        verifier
      );
      await repository.initialize();
      await repository.storeVerifiedApproval(fixture.record);
      await pool.query(`
        CREATE FUNCTION "${schema}".reject_policy_audit() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END $$;
        CREATE TRIGGER reject_policy_audit BEFORE INSERT
        ON "${schema}".policy_execution_audit
        FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_policy_audit()
      `);
      await assert.rejects(
        repository.claimExecution(claimRequest(fixture, "rollback-key")),
        /forced audit failure/u
      );
      const counts = await pool.query(
        `SELECT
           (SELECT count(*) FROM "${schema}".policy_execution_claims) AS claims,
           (SELECT count(*) FROM "${schema}".policy_execution_intents) AS intents,
           (SELECT count(*) FROM "${schema}".policy_execution_outbox) AS outbox,
           (SELECT count(*) FROM "${schema}".policy_execution_audit) AS audits`
      );
      assert.deepEqual(counts.rows[0], {
        audits: "0",
        claims: "0",
        intents: "0",
        outbox: "0",
      });
      await pool.query(
        `DROP TRIGGER reject_policy_audit ON "${schema}".policy_execution_audit`
      );
      const retry = await repository.claimExecution(
        claimRequest(fixture, "rollback-key")
      );
      assert.equal(retry.status, "claimed");
      assert.equal(retry.retry, false);
    } finally {
      await dropSchema(pool, schema);
      await pool.end();
    }
  }
);

integrationTest(
  "fails closed on migration-record and physical-schema drift",
  async () => {
    const checksumSchema = createSchema();
    const indexSchema = createSchema();
    const structureSchema = createSchema();
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const checksumRepository = new PostgresApprovalExecutionRepository(
        pool,
        checksumSchema,
        verifier
      );
      await checksumRepository.initialize();
      await pool.query(
        `UPDATE "${checksumSchema}".policy_schema_migrations
         SET checksum = $1 WHERE version = 1`,
        ["0".repeat(64)]
      );
      await assert.rejects(
        checksumRepository.initialize(),
        /migration drift detected/u
      );

      const structureRepository = new PostgresApprovalExecutionRepository(
        pool,
        structureSchema,
        verifier
      );
      await structureRepository.initialize();
      await pool.query(
        `ALTER TABLE "${structureSchema}".policy_execution_claims DROP COLUMN outcome`
      );
      await assert.rejects(
        structureRepository.initialize(),
        /column drift detected/u
      );

      const indexRepository = new PostgresApprovalExecutionRepository(
        pool,
        indexSchema,
        verifier
      );
      await indexRepository.initialize();
      await pool.query(`
        DROP INDEX "${indexSchema}".policy_approval_records_nonce_unique;
        CREATE UNIQUE INDEX policy_approval_records_nonce_unique
          ON "${indexSchema}".policy_approval_records (approval_id)
      `);
      await assert.rejects(
        indexRepository.initialize(),
        /index drift detected/u
      );
    } finally {
      await dropSchema(pool, checksumSchema);
      await dropSchema(pool, indexSchema);
      await dropSchema(pool, structureSchema);
      await pool.end();
    }
  }
);

integrationTest(
  "rejects unexpected policy-schema tables, indexes, and triggers",
  async () => {
    const extraIndexSchema = createSchema();
    const extraTableSchema = createSchema();
    const triggerSchema = createSchema();
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const extraIndexRepository = new PostgresApprovalExecutionRepository(
        pool,
        extraIndexSchema,
        verifier
      );
      await extraIndexRepository.initialize();
      await pool.query(
        `CREATE INDEX unexpected_policy_revision_index
         ON "${extraIndexSchema}".policy_approval_records (revision)`
      );
      await assert.rejects(
        extraIndexRepository.initialize(),
        /index drift detected/u
      );

      const extraTableRepository = new PostgresApprovalExecutionRepository(
        pool,
        extraTableSchema,
        verifier
      );
      await extraTableRepository.initialize();
      await pool.query(
        `CREATE TABLE "${extraTableSchema}".unexpected_policy_data (id text PRIMARY KEY)`
      );
      await assert.rejects(
        extraTableRepository.initialize(),
        /table drift detected/u
      );

      const triggerRepository = new PostgresApprovalExecutionRepository(
        pool,
        triggerSchema,
        verifier
      );
      await triggerRepository.initialize();
      await pool.query(`
        CREATE FUNCTION "${triggerSchema}".unexpected_policy_trigger()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER unexpected_policy_trigger BEFORE INSERT
        ON "${triggerSchema}".policy_approval_records
        FOR EACH ROW EXECUTE FUNCTION "${triggerSchema}".unexpected_policy_trigger()
      `);
      await assert.rejects(
        triggerRepository.initialize(),
        /trigger drift detected/u
      );
    } finally {
      await dropSchema(pool, extraIndexSchema);
      await dropSchema(pool, extraTableSchema);
      await dropSchema(pool, triggerSchema);
      await pool.end();
    }
  }
);

integrationTest(
  "rejects unlogged tables, schema routines, public writes, and disabled FK triggers",
  async () => {
    const aclSchema = createSchema();
    const disabledTriggerSchema = createSchema();
    const routineSchema = createSchema();
    const unloggedSchema = createSchema();
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const unloggedRepository = new PostgresApprovalExecutionRepository(
        pool,
        unloggedSchema,
        verifier
      );
      await unloggedRepository.initialize();
      await pool.query(
        `ALTER TABLE "${unloggedSchema}".policy_execution_audit SET UNLOGGED`
      );
      await assert.rejects(
        unloggedRepository.initialize(),
        /table drift detected/u
      );

      const routineRepository = new PostgresApprovalExecutionRepository(
        pool,
        routineSchema,
        verifier
      );
      await routineRepository.initialize();
      await pool.query(`
        CREATE FUNCTION "${routineSchema}".unsafe_security_definer()
        RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
        GRANT EXECUTE ON FUNCTION "${routineSchema}".unsafe_security_definer() TO PUBLIC
      `);
      await assert.rejects(
        routineRepository.initialize(),
        /routine drift detected/u
      );

      const aclRepository = new PostgresApprovalExecutionRepository(
        pool,
        aclSchema,
        verifier
      );
      await aclRepository.initialize();
      await pool.query(
        `GRANT INSERT, UPDATE ON "${aclSchema}".policy_approval_records TO PUBLIC`
      );
      await assert.rejects(aclRepository.initialize(), /ACL drift detected/u);

      const disabledTriggerRepository = new PostgresApprovalExecutionRepository(
        pool,
        disabledTriggerSchema,
        verifier
      );
      await disabledTriggerRepository.initialize();
      await pool.query(
        `ALTER TABLE "${disabledTriggerSchema}".policy_execution_claims DISABLE TRIGGER ALL`
      );
      await assert.rejects(
        disabledTriggerRepository.initialize(),
        /internal trigger drift detected/u
      );
    } finally {
      await dropSchema(pool, aclSchema);
      await dropSchema(pool, disabledTriggerSchema);
      await dropSchema(pool, routineSchema);
      await dropSchema(pool, unloggedSchema);
      await pool.end();
    }
  }
);

integrationTest(
  "rejects revoked owner table and schema privileges as ACL drift",
  async () => {
    const maintainAclSchema = createSchema();
    const schemaAclSchema = createSchema();
    const tableAclSchema = createSchema();
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const tableAclRepository = new PostgresApprovalExecutionRepository(
        pool,
        tableAclSchema,
        verifier
      );
      await tableAclRepository.initialize();
      await pool.query(
        `REVOKE INSERT ON "${tableAclSchema}".policy_approval_records FROM CURRENT_USER`
      );
      await assert.rejects(
        tableAclRepository.initialize(),
        /table ACL drift detected/u
      );

      const maintainAclRepository = new PostgresApprovalExecutionRepository(
        pool,
        maintainAclSchema,
        verifier
      );
      await maintainAclRepository.initialize();
      await pool.query(
        `REVOKE MAINTAIN ON "${maintainAclSchema}".policy_approval_records FROM CURRENT_USER`
      );
      await assert.rejects(
        maintainAclRepository.initialize(),
        /table ACL drift detected/u
      );

      const schemaAclRepository = new PostgresApprovalExecutionRepository(
        pool,
        schemaAclSchema,
        verifier
      );
      await schemaAclRepository.initialize();
      await pool.query(
        `REVOKE USAGE, CREATE ON SCHEMA "${schemaAclSchema}" FROM CURRENT_USER`
      );
      await assert.rejects(
        schemaAclRepository.initialize(),
        /schema ACL drift detected/u
      );
    } finally {
      await dropSchema(pool, maintainAclSchema);
      await dropSchema(pool, schemaAclSchema);
      await dropSchema(pool, tableAclSchema);
      await pool.end();
    }
  }
);
