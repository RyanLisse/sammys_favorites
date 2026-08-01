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
import {
  POLICY_INTERNAL_FK_TRIGGERS,
  POLICY_NONCE_INDEX_DEFINITION,
  POLICY_SCHEMA_COLUMNS,
  POLICY_SCHEMA_CONSTRAINTS,
  POLICY_SCHEMA_INDEXES,
  POLICY_SCHEMA_MIGRATIONS,
  POLICY_SCHEMA_OWNER_PRIVILEGES,
  POLICY_SCHEMA_POLICIES,
  POLICY_SCHEMA_RELATIONS,
  POLICY_SCHEMA_RULES,
  POLICY_SCHEMA_ROUTINES,
  POLICY_SCHEMA_TRIGGERS,
  POLICY_TABLE_OWNER_PRIVILEGES,
} from "./postgres-policy-migrations.js";

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

interface MigrationRow extends QueryResultRow {
  readonly checksum: string;
  readonly name: string;
  readonly version: number;
}

interface SchemaColumnsRow extends QueryResultRow {
  readonly columns: string;
  readonly table_name: keyof typeof POLICY_SCHEMA_COLUMNS;
}

interface ConstraintDefinitionRow extends QueryResultRow {
  readonly conname: string;
  readonly contype: string;
  readonly definition: string;
  readonly table_name: string;
}

interface IndexDefinitionRow extends QueryResultRow {
  readonly definition: string;
  readonly indisready: boolean;
  readonly indisunique: boolean;
  readonly indisvalid: boolean;
  readonly index_name: string;
  readonly owner_matches: boolean;
  readonly relpersistence: string;
  readonly table_name: string;
}

interface RelationRow extends QueryResultRow {
  readonly owner_matches: boolean;
  readonly relforcerowsecurity: boolean;
  readonly relkind: string;
  readonly relname: string;
  readonly relpersistence: string;
  readonly relrowsecurity: boolean;
}

interface DefinitionRow extends QueryResultRow {
  readonly definition: string;
  readonly object_name: string;
  readonly table_name: string;
}

interface PolicyRow extends QueryResultRow {
  readonly command: string;
  readonly permissive: boolean;
  readonly policy_name: string;
  readonly qualification: string | null;
  readonly roles: readonly string[];
  readonly table_name: string;
  readonly with_check: string | null;
}

interface AclInvariantRow extends QueryResultRow {
  readonly object_name: string;
  readonly owner_matches: boolean;
  readonly owner_privileges: string;
  readonly unexpected_acl_entries: string;
}

interface RoutineRow extends QueryResultRow {
  readonly definition: string;
  readonly identity_arguments: string;
  readonly object_name: string;
  readonly owner_matches: boolean;
  readonly prokind: string;
  readonly prosecdef: boolean;
  readonly public_execute_grants: string;
  readonly unexpected_acl_entries: string;
}

interface InternalTriggerRow extends QueryResultRow {
  readonly all_enabled: boolean;
  readonly conname: string;
  readonly trigger_count: string;
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

const normalizePostgresDefinition = (
  definition: string,
  schema: string
): string =>
  definition.replaceAll(`${schema}.`, "<schema>.").replaceAll(/\s+/gu, " ");

const transactionRollbackError = (
  operationError: unknown,
  rollbackError: unknown
): AggregateError =>
  new AggregateError(
    [operationError, rollbackError],
    "Policy transaction and rollback failed",
    { cause: operationError }
  );

const initializationUnlockError = (
  operationError: unknown,
  unlockError: unknown
): AggregateError =>
  new AggregateError(
    [operationError, unlockError],
    "Policy schema initialization and advisory unlock failed",
    { cause: operationError }
  );

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
    const client = await this.#pool.connect();
    let clientStateIndeterminate = false;
    let lockAcquired = false;
    let operationError: unknown = null;
    let transactionStarted = false;
    try {
      clientStateIndeterminate = true;
      await client.query(
        "SELECT pg_advisory_lock(hashtext(current_database()), hashtext($1))",
        [`sammys-policy:${this.#schema}`]
      );
      clientStateIndeterminate = false;
      lockAcquired = true;
      clientStateIndeterminate = true;
      await client.query("BEGIN");
      clientStateIndeterminate = false;
      transactionStarted = true;
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.#schema}"`);
      await this.#assertSchemaOwnershipAndAclFingerprint(client);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${this.#schema}".policy_schema_migrations (
          version integer PRIMARY KEY,
          name text NOT NULL,
          checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      const appliedResult = await client.query<MigrationRow>(
        `SELECT version, name, checksum
         FROM "${this.#schema}".policy_schema_migrations
         ORDER BY version`
      );
      const migrationsByVersion = new Map(
        POLICY_SCHEMA_MIGRATIONS.map((migration) => [
          migration.version,
          migration,
        ])
      );
      for (const applied of appliedResult.rows) {
        const migration = migrationsByVersion.get(applied.version);
        if (
          !migration ||
          migration.name !== applied.name ||
          migration.checksum !== applied.checksum
        ) {
          throw new Error(
            `Policy schema migration drift detected at version ${applied.version}`
          );
        }
      }
      const appliedVersions = new Set(
        appliedResult.rows.map(({ version }) => version)
      );
      if (
        appliedVersions.size === 0 &&
        (await this.#hasLegacyPolicyTables(client))
      ) {
        const [initialMigration] = POLICY_SCHEMA_MIGRATIONS;
        if (!(initialMigration && initialMigration.version === 1)) {
          throw new Error("Policy legacy schema cannot be safely adopted");
        }
        await this.#assertSchemaFingerprint(client);
        await client.query(
          `INSERT INTO "${this.#schema}".policy_schema_migrations
           (version, name, checksum) VALUES ($1, $2, $3)`,
          [
            initialMigration.version,
            initialMigration.name,
            initialMigration.checksum,
          ]
        );
        appliedVersions.add(initialMigration.version);
      }
      for (const migration of POLICY_SCHEMA_MIGRATIONS) {
        if (appliedVersions.has(migration.version)) {
          continue;
        }
        await client.query(migration.sql(this.#schema));
        await client.query(
          `INSERT INTO "${this.#schema}".policy_schema_migrations
           (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum]
        );
      }
      await this.#assertSchemaFingerprint(client);
      clientStateIndeterminate = true;
      await client.query("COMMIT");
      clientStateIndeterminate = false;
      transactionStarted = false;
    } catch (error) {
      operationError = error;
      if (transactionStarted && !clientStateIndeterminate) {
        try {
          clientStateIndeterminate = true;
          await client.query("ROLLBACK");
          clientStateIndeterminate = false;
        } catch (rollbackError) {
          operationError = new AggregateError(
            [error, rollbackError],
            "Policy schema initialization and rollback failed"
          );
        } finally {
          transactionStarted = false;
        }
      }
    }
    operationError = await this.#releaseInitializeClient(
      client,
      clientStateIndeterminate,
      lockAcquired,
      operationError
    );
    if (operationError) {
      throw operationError;
    }
  };

  #releaseInitializeClient = async (
    client: PoolClient,
    clientStateIndeterminate: boolean,
    lockAcquired: boolean,
    operationError: unknown
  ): Promise<unknown> => {
    if (clientStateIndeterminate) {
      client.release(true);
      return operationError;
    }
    if (!lockAcquired) {
      client.release();
      return operationError;
    }
    try {
      const unlockResult = await client.query<{ readonly unlocked: boolean }>(
        "SELECT pg_advisory_unlock(hashtext(current_database()), hashtext($1)) AS unlocked",
        [`sammys-policy:${this.#schema}`]
      );
      if (unlockResult.rows[0]?.unlocked !== true) {
        const unlockError = new Error(
          "Policy schema advisory lock release failed"
        );
        client.release(true);
        return operationError === null
          ? unlockError
          : initializationUnlockError(operationError, unlockError);
      }
      client.release();
      return operationError;
    } catch (unlockError) {
      client.release(true);
      return operationError === null
        ? unlockError
        : initializationUnlockError(operationError, unlockError);
    }
  };

  #hasLegacyPolicyTables = async (client: PoolClient): Promise<boolean> => {
    const legacyTableNames = POLICY_SCHEMA_RELATIONS.filter(
      (relation) => !relation.includes(":policy_schema_migrations:")
    ).map((relation) => relation.split(":")[2]);
    const result = await client.query(
      `SELECT 1
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1
         AND relation.relkind IN ('r', 'p')
         AND relation.relname = ANY($2::text[])
       LIMIT 1`,
      [this.#schema, legacyTableNames]
    );
    return result.rowCount === 1;
  };

  #assertSchemaOwnershipAndAclFingerprint = async (
    client: PoolClient
  ): Promise<void> => {
    const schemaResult = await client.query<AclInvariantRow>(
      `SELECT namespace.nspname AS object_name,
              pg_get_userbyid(namespace.nspowner) = current_user AS owner_matches,
              (
                SELECT coalesce(
                  string_agg(
                    acl.privilege_type || ':' || acl.is_grantable::text,
                    ',' ORDER BY acl.privilege_type, acl.is_grantable
                  ),
                  ''
                )
                FROM aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) AS acl
                WHERE acl.grantee = namespace.nspowner AND acl.grantor = namespace.nspowner
              ) AS owner_privileges,
              (
                SELECT count(*)::text
                FROM aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) AS acl
                WHERE acl.grantee <> namespace.nspowner OR acl.grantor <> namespace.nspowner
              ) AS unexpected_acl_entries
       FROM pg_namespace AS namespace
       WHERE namespace.nspname = $1`,
      [this.#schema]
    );
    const [schemaAcl] = schemaResult.rows;
    if (
      !schemaAcl ||
      !schemaAcl.owner_matches ||
      schemaAcl.owner_privileges !== POLICY_SCHEMA_OWNER_PRIVILEGES ||
      schemaAcl.unexpected_acl_entries !== "0" ||
      schemaAcl.object_name !== this.#schema
    ) {
      throw new Error("Policy schema ACL drift detected");
    }
  };

  #assertTableOwnershipAndAclFingerprint = async (
    client: PoolClient,
    tableNames: readonly string[]
  ): Promise<void> => {
    const tableResult = await client.query<AclInvariantRow>(
      `SELECT relation.relname AS object_name,
              pg_get_userbyid(relation.relowner) = current_user AS owner_matches,
              (
                SELECT coalesce(
                  string_agg(
                    acl.privilege_type || ':' || acl.is_grantable::text,
                    ',' ORDER BY acl.privilege_type, acl.is_grantable
                  ),
                  ''
                )
                FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS acl
                WHERE acl.grantee = relation.relowner AND acl.grantor = relation.relowner
                  AND acl.privilege_type = ANY(
                    ARRAY['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
                  )
              ) AS owner_privileges,
              (
                SELECT count(*)::text
                FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS acl
                WHERE acl.grantee <> relation.relowner OR acl.grantor <> relation.relowner
              ) AS unexpected_acl_entries
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1
         AND relation.relkind IN ('r', 'p')
         AND relation.relname = ANY($2::text[])
       ORDER BY relation.relname`,
      [this.#schema, tableNames]
    );
    const actualTableAcls = tableResult.rows.map(
      ({
        object_name,
        owner_matches,
        owner_privileges,
        unexpected_acl_entries,
      }) =>
        `${object_name}:${owner_matches}:${owner_privileges}:${unexpected_acl_entries}`
    );
    const expectedTableAcls = tableNames.map(
      (tableName) => `${tableName}:true:${POLICY_TABLE_OWNER_PRIVILEGES}:0`
    );
    if (JSON.stringify(actualTableAcls) !== JSON.stringify(expectedTableAcls)) {
      throw new Error("Policy table ACL drift detected");
    }
  };

  #assertSchemaFingerprint = async (client: PoolClient): Promise<void> => {
    const tableNames = Object.keys(POLICY_SCHEMA_COLUMNS);
    await this.#assertTableOwnershipAndAclFingerprint(client, tableNames);
    const relationResult = await client.query<RelationRow>(
      `SELECT relation.relkind, relation.relpersistence, relation.relname,
              relation.relrowsecurity, relation.relforcerowsecurity,
              pg_get_userbyid(relation.relowner) = current_user AS owner_matches
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       ORDER BY relation.relkind, relation.relname`,
      [this.#schema]
    );
    const actualRelations = relationResult.rows.map(
      ({
        owner_matches,
        relforcerowsecurity,
        relkind,
        relname,
        relpersistence,
        relrowsecurity,
      }) =>
        `${relkind}:${relpersistence}:${relname}:${relrowsecurity}:${relforcerowsecurity}:${owner_matches}`
    );
    if (
      JSON.stringify(actualRelations) !==
      JSON.stringify(POLICY_SCHEMA_RELATIONS)
    ) {
      throw new Error("Policy schema table drift detected");
    }
    const columnResult = await client.query<SchemaColumnsRow>(
      `SELECT table_name,
              string_agg(column_name || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, ''),
                         ',' ORDER BY ordinal_position) AS columns
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = ANY($2::text[])
       GROUP BY table_name
       ORDER BY table_name`,
      [this.#schema, tableNames]
    );
    const actualColumns = Object.fromEntries(
      columnResult.rows.map(({ columns, table_name }) => [table_name, columns])
    );
    if (
      JSON.stringify(actualColumns) !== JSON.stringify(POLICY_SCHEMA_COLUMNS)
    ) {
      throw new Error("Policy schema column drift detected");
    }
    const constraintResult = await client.query<ConstraintDefinitionRow>(
      `SELECT relation.relname AS table_name,
              constraint_record.contype,
              constraint_record.conname,
              pg_get_constraintdef(constraint_record.oid, false) AS definition
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1 AND relation.relname = ANY($2::text[])
       ORDER BY relation.relname, constraint_record.contype, constraint_record.conname`,
      [this.#schema, tableNames]
    );
    const actualConstraints = constraintResult.rows.map(
      ({ conname, contype, definition, table_name }) =>
        `${table_name}:${contype}:${conname}:${normalizePostgresDefinition(
          definition,
          this.#schema
        )}`
    );
    if (
      JSON.stringify(actualConstraints) !==
      JSON.stringify(POLICY_SCHEMA_CONSTRAINTS)
    ) {
      throw new Error("Policy schema constraint drift detected");
    }
    const indexResult = await client.query<IndexDefinitionRow>(
      `SELECT relation.relname AS table_name,
              index_relation.relname AS index_name,
              index_relation.relpersistence,
              pg_get_userbyid(index_relation.relowner) = current_user AS owner_matches,
              index.indisunique, index.indisvalid, index.indisready,
              pg_get_indexdef(index.indexrelid, 0, false) AS definition
       FROM pg_index AS index
       JOIN pg_class AS relation ON relation.oid = index.indrelid
       JOIN pg_class AS index_relation ON index_relation.oid = index.indexrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1
       ORDER BY relation.relname, index_relation.relname`,
      [this.#schema]
    );
    const actualIndexes = indexResult.rows.map(
      ({
        definition,
        indisready,
        indisunique,
        indisvalid,
        index_name,
        owner_matches,
        relpersistence,
        table_name,
      }) =>
        `${table_name}:${index_name}:${relpersistence}:${owner_matches}:${indisunique}:${indisvalid}:${indisready}:${normalizePostgresDefinition(
          definition,
          this.#schema
        )}`
    );
    if (
      JSON.stringify(actualIndexes) !== JSON.stringify(POLICY_SCHEMA_INDEXES)
    ) {
      throw new Error("Policy schema index drift detected");
    }
    const nonceIndex = indexResult.rows.find(
      ({ index_name }) => index_name === "policy_approval_records_nonce_unique"
    );
    const nonceIndexDefinition = nonceIndex
      ? `${nonceIndex.indisunique}:${nonceIndex.indisvalid}:${nonceIndex.indisready}:${normalizePostgresDefinition(
          nonceIndex.definition,
          this.#schema
        )}`
      : null;
    if (nonceIndexDefinition !== POLICY_NONCE_INDEX_DEFINITION) {
      throw new Error("Policy schema nonce index drift detected");
    }
    const internalTriggerResult = await client.query<InternalTriggerRow>(
      `SELECT constraint_record.conname,
              count(*)::text AS trigger_count,
              bool_and(trigger.tgenabled = 'O') AS all_enabled
       FROM pg_trigger AS trigger
       JOIN pg_constraint AS constraint_record
         ON constraint_record.oid = trigger.tgconstraint
       JOIN pg_namespace AS constraint_namespace
         ON constraint_namespace.oid = constraint_record.connamespace
       WHERE constraint_namespace.nspname = $1 AND trigger.tgisinternal
       GROUP BY constraint_record.conname
       ORDER BY constraint_record.conname`,
      [this.#schema]
    );
    const actualInternalTriggers = internalTriggerResult.rows.map(
      ({ all_enabled, conname, trigger_count }) =>
        `${conname}:${trigger_count}:${all_enabled}`
    );
    if (
      JSON.stringify(actualInternalTriggers) !==
      JSON.stringify(POLICY_INTERNAL_FK_TRIGGERS)
    ) {
      throw new Error("Policy schema internal trigger drift detected");
    }
    const triggerResult = await client.query<DefinitionRow>(
      `SELECT relation.relname AS table_name,
              trigger.tgname AS object_name,
              pg_get_triggerdef(trigger.oid, false) AS definition
       FROM pg_trigger AS trigger
       JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1 AND NOT trigger.tgisinternal
       ORDER BY relation.relname, trigger.tgname`,
      [this.#schema]
    );
    const actualTriggers = triggerResult.rows.map(
      ({ definition, object_name, table_name }) =>
        `${table_name}:${object_name}:${normalizePostgresDefinition(
          definition,
          this.#schema
        )}`
    );
    if (
      JSON.stringify(actualTriggers) !== JSON.stringify(POLICY_SCHEMA_TRIGGERS)
    ) {
      throw new Error("Policy schema trigger drift detected");
    }
    const ruleResult = await client.query<DefinitionRow>(
      `SELECT relation.relname AS table_name,
              rewrite.rulename AS object_name,
              pg_get_ruledef(rewrite.oid, false) AS definition
       FROM pg_rewrite AS rewrite
       JOIN pg_class AS relation ON relation.oid = rewrite.ev_class
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1 AND rewrite.rulename <> '_RETURN'
       ORDER BY relation.relname, rewrite.rulename`,
      [this.#schema]
    );
    const actualRules = ruleResult.rows.map(
      ({ definition, object_name, table_name }) =>
        `${table_name}:${object_name}:${normalizePostgresDefinition(
          definition,
          this.#schema
        )}`
    );
    if (JSON.stringify(actualRules) !== JSON.stringify(POLICY_SCHEMA_RULES)) {
      throw new Error("Policy schema rule drift detected");
    }
    const policyResult = await client.query<PolicyRow>(
      `SELECT relation.relname AS table_name,
              policy.polname AS policy_name,
              policy.polpermissive AS permissive,
              policy.polcmd AS command,
              ARRAY(
                SELECT coalesce(role.rolname, 'public')
                FROM unnest(policy.polroles) AS role_id
                LEFT JOIN pg_roles AS role ON role.oid = role_id
                ORDER BY coalesce(role.rolname, 'public')
              ) AS roles,
              pg_get_expr(policy.polqual, policy.polrelid) AS qualification,
              pg_get_expr(policy.polwithcheck, policy.polrelid) AS with_check
       FROM pg_policy AS policy
       JOIN pg_class AS relation ON relation.oid = policy.polrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1
       ORDER BY relation.relname, policy.polname`,
      [this.#schema]
    );
    const actualPolicies = policyResult.rows.map(
      ({
        command,
        permissive,
        policy_name,
        qualification,
        roles,
        table_name,
        with_check,
      }) =>
        `${table_name}:${policy_name}:${permissive}:${command}:${roles.join(
          ","
        )}:${qualification ?? ""}:${with_check ?? ""}`
    );
    if (
      JSON.stringify(actualPolicies) !== JSON.stringify(POLICY_SCHEMA_POLICIES)
    ) {
      throw new Error("Policy schema policy drift detected");
    }
    const routineResult = await client.query<RoutineRow>(
      `SELECT procedure.proname AS object_name,
              pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
              procedure.prokind,
              procedure.prosecdef,
              pg_get_userbyid(procedure.proowner) = current_user AS owner_matches,
              pg_get_functiondef(procedure.oid) AS definition,
              (
                SELECT count(*)::text
                FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
                WHERE acl.grantee <> procedure.proowner OR acl.grantor <> procedure.proowner
              ) AS unexpected_acl_entries,
              (
                SELECT count(*)::text
                FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
                WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
              ) AS public_execute_grants
       FROM pg_proc AS procedure
       JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = $1
       ORDER BY procedure.proname, pg_get_function_identity_arguments(procedure.oid)`,
      [this.#schema]
    );
    const actualRoutines = routineResult.rows.map(
      ({
        definition,
        identity_arguments,
        object_name,
        owner_matches,
        prokind,
        prosecdef,
        public_execute_grants,
        unexpected_acl_entries,
      }) =>
        `${object_name}:${identity_arguments}:${prokind}:${prosecdef}:${owner_matches}:${unexpected_acl_entries}:${public_execute_grants}:${normalizePostgresDefinition(
          definition,
          this.#schema
        )}`
    );
    if (
      JSON.stringify(actualRoutines) !== JSON.stringify(POLICY_SCHEMA_ROUTINES)
    ) {
      throw new Error("Policy schema routine drift detected");
    }
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

  claimExecution = (
    request: ExecutionClaimRequest
  ): Promise<ExecutionClaimResult> =>
    this.#runInTransaction((client) =>
      this.#claimInTransaction(client, request)
    );

  #runInTransaction = async <Result>(
    operation: (client: PoolClient) => Promise<Result>
  ): Promise<Result> => {
    const client = await this.#pool.connect();
    let clientStateIndeterminate = false;
    let transactionStarted = false;
    try {
      clientStateIndeterminate = true;
      await client.query("BEGIN");
      clientStateIndeterminate = false;
      transactionStarted = true;
      const result = await operation(client);
      clientStateIndeterminate = true;
      await client.query("COMMIT");
      clientStateIndeterminate = false;
      transactionStarted = false;
      client.release();
      return result;
    } catch (error) {
      if (transactionStarted && !clientStateIndeterminate) {
        try {
          clientStateIndeterminate = true;
          await client.query("ROLLBACK");
          clientStateIndeterminate = false;
          transactionStarted = false;
        } catch (rollbackError) {
          client.release(true);
          throw transactionRollbackError(error, rollbackError);
        }
      }
      if (clientStateIndeterminate) {
        client.release(true);
      } else {
        client.release();
      }
      throw error;
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

  completeExecution = (
    claimId: string,
    completion: ExecutionCompletion
  ): Promise<boolean> =>
    this.#runInTransaction(async (client) => {
      const claimResult = await client.query<ClaimRow>(
        `SELECT * FROM "${this.#schema}".policy_execution_claims
         WHERE claim_id = $1 FOR UPDATE`,
        [claimId]
      );
      const [claim] = claimResult.rows;
      if (!claim) {
        return false;
      }
      if (claim.completed_at) {
        const isSameCompletion =
          claim.outcome === completion.outcome &&
          claim.completed_at.getTime() === completion.completedAt.getTime();
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
      return true;
    });
}
