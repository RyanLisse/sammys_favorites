import { createHash } from "node:crypto";

export interface PolicySchemaMigration {
  readonly checksum: string;
  readonly name: string;
  readonly sql: (schema: string) => string;
  readonly version: number;
}

const INITIAL_POLICY_SCHEMA_SQL = (schema: string): string => `
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
`;

const checksum = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const INITIAL_POLICY_SCHEMA_TEMPLATE =
  INITIAL_POLICY_SCHEMA_SQL("__policy_schema__");

export const POLICY_SCHEMA_MIGRATIONS: readonly PolicySchemaMigration[] =
  Object.freeze([
    Object.freeze({
      checksum: checksum(INITIAL_POLICY_SCHEMA_TEMPLATE),
      name: "initial_policy_execution_schema",
      sql: INITIAL_POLICY_SCHEMA_SQL,
      version: 1,
    }),
  ]);

export const POLICY_SCHEMA_OWNER_PRIVILEGES = "CREATE:false,USAGE:false";

export const POLICY_TABLE_OWNER_PRIVILEGES =
  "DELETE:false,INSERT:false,MAINTAIN:false,REFERENCES:false,SELECT:false,TRIGGER:false,TRUNCATE:false,UPDATE:false";

export const POLICY_SCHEMA_COLUMNS = Object.freeze({
  policy_approval_records:
    "approval_id:text:NO:,approval:jsonb:NO:,proposal:jsonb:NO:,revision:text:NO:,created_at:timestamptz:NO:now()",
  policy_execution_audit:
    "audit_receipt_id:text:NO:,claim_id:text:NO:,actor_id:text:NO:,approval_id:text:NO:,binding_sha256:text:NO:,reason_code:text:NO:,resource_id:text:NO:,occurred_at:timestamptz:NO:",
  policy_execution_claims:
    "claim_id:text:NO:,approval_id:text:NO:,idempotency_key:text:NO:,binding_sha256:text:NO:,execution_intent_id:text:NO:,outbox_message_id:text:NO:,audit_receipt_id:text:NO:,status:text:NO:,outcome:text:YES:,completed_at:timestamptz:YES:,created_at:timestamptz:NO:",
  policy_execution_intents:
    "execution_intent_id:text:NO:,claim_id:text:NO:,binding:jsonb:NO:,status:text:NO:",
  policy_execution_outbox:
    "outbox_message_id:text:NO:,claim_id:text:NO:,payload:jsonb:NO:,status:text:NO:",
  policy_schema_migrations:
    "version:int4:NO:,name:text:NO:,checksum:text:NO:,applied_at:timestamptz:NO:now()",
} as const);

export const POLICY_SCHEMA_CONSTRAINTS = Object.freeze([
  "policy_approval_records:p:policy_approval_records_pkey:PRIMARY KEY (approval_id)",
  "policy_execution_audit:f:policy_execution_audit_claim_id_fkey:FOREIGN KEY (claim_id) REFERENCES <schema>.policy_execution_claims(claim_id)",
  "policy_execution_audit:p:policy_execution_audit_pkey:PRIMARY KEY (audit_receipt_id)",
  "policy_execution_audit:u:policy_execution_audit_claim_id_key:UNIQUE (claim_id)",
  "policy_execution_claims:c:policy_execution_claims_outcome_check:CHECK ((outcome = ANY (ARRAY['failed'::text, 'succeeded'::text])))",
  "policy_execution_claims:c:policy_execution_claims_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])))",
  "policy_execution_claims:f:policy_execution_claims_approval_id_fkey:FOREIGN KEY (approval_id) REFERENCES <schema>.policy_approval_records(approval_id)",
  "policy_execution_claims:p:policy_execution_claims_pkey:PRIMARY KEY (claim_id)",
  "policy_execution_claims:u:policy_execution_claims_approval_id_key:UNIQUE (approval_id)",
  "policy_execution_claims:u:policy_execution_claims_audit_receipt_id_key:UNIQUE (audit_receipt_id)",
  "policy_execution_claims:u:policy_execution_claims_execution_intent_id_key:UNIQUE (execution_intent_id)",
  "policy_execution_claims:u:policy_execution_claims_outbox_message_id_key:UNIQUE (outbox_message_id)",
  "policy_execution_intents:c:policy_execution_intents_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])))",
  "policy_execution_intents:f:policy_execution_intents_claim_id_fkey:FOREIGN KEY (claim_id) REFERENCES <schema>.policy_execution_claims(claim_id)",
  "policy_execution_intents:p:policy_execution_intents_pkey:PRIMARY KEY (execution_intent_id)",
  "policy_execution_intents:u:policy_execution_intents_claim_id_key:UNIQUE (claim_id)",
  "policy_execution_outbox:c:policy_execution_outbox_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text])))",
  "policy_execution_outbox:f:policy_execution_outbox_claim_id_fkey:FOREIGN KEY (claim_id) REFERENCES <schema>.policy_execution_claims(claim_id)",
  "policy_execution_outbox:p:policy_execution_outbox_pkey:PRIMARY KEY (outbox_message_id)",
  "policy_execution_outbox:u:policy_execution_outbox_claim_id_key:UNIQUE (claim_id)",
  "policy_schema_migrations:c:policy_schema_migrations_checksum_check:CHECK ((checksum ~ '^[a-f0-9]{64}$'::text))",
  "policy_schema_migrations:p:policy_schema_migrations_pkey:PRIMARY KEY (version)",
]);

export const POLICY_NONCE_INDEX_DEFINITION =
  "true:true:true:CREATE UNIQUE INDEX policy_approval_records_nonce_unique ON <schema>.policy_approval_records USING btree (((approval ->> 'nonce'::text)))";

export const POLICY_SCHEMA_RELATIONS = Object.freeze([
  "r:p:policy_approval_records:false:false:true",
  "r:p:policy_execution_audit:false:false:true",
  "r:p:policy_execution_claims:false:false:true",
  "r:p:policy_execution_intents:false:false:true",
  "r:p:policy_execution_outbox:false:false:true",
  "r:p:policy_schema_migrations:false:false:true",
]);

export const POLICY_SCHEMA_INDEXES = Object.freeze([
  "policy_approval_records:policy_approval_records_nonce_unique:p:true:true:true:true:CREATE UNIQUE INDEX policy_approval_records_nonce_unique ON <schema>.policy_approval_records USING btree (((approval ->> 'nonce'::text)))",
  "policy_approval_records:policy_approval_records_pkey:p:true:true:true:true:CREATE UNIQUE INDEX policy_approval_records_pkey ON <schema>.policy_approval_records USING btree (approval_id)",
  "policy_execution_audit:policy_execution_audit_claim_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_audit_claim_id_key ON <schema>.policy_execution_audit USING btree (claim_id)",
  "policy_execution_audit:policy_execution_audit_pkey:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_audit_pkey ON <schema>.policy_execution_audit USING btree (audit_receipt_id)",
  "policy_execution_claims:policy_execution_claims_approval_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_claims_approval_id_key ON <schema>.policy_execution_claims USING btree (approval_id)",
  "policy_execution_claims:policy_execution_claims_audit_receipt_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_claims_audit_receipt_id_key ON <schema>.policy_execution_claims USING btree (audit_receipt_id)",
  "policy_execution_claims:policy_execution_claims_execution_intent_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_claims_execution_intent_id_key ON <schema>.policy_execution_claims USING btree (execution_intent_id)",
  "policy_execution_claims:policy_execution_claims_outbox_message_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_claims_outbox_message_id_key ON <schema>.policy_execution_claims USING btree (outbox_message_id)",
  "policy_execution_claims:policy_execution_claims_pkey:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_claims_pkey ON <schema>.policy_execution_claims USING btree (claim_id)",
  "policy_execution_intents:policy_execution_intents_claim_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_intents_claim_id_key ON <schema>.policy_execution_intents USING btree (claim_id)",
  "policy_execution_intents:policy_execution_intents_pkey:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_intents_pkey ON <schema>.policy_execution_intents USING btree (execution_intent_id)",
  "policy_execution_outbox:policy_execution_outbox_claim_id_key:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_outbox_claim_id_key ON <schema>.policy_execution_outbox USING btree (claim_id)",
  "policy_execution_outbox:policy_execution_outbox_pkey:p:true:true:true:true:CREATE UNIQUE INDEX policy_execution_outbox_pkey ON <schema>.policy_execution_outbox USING btree (outbox_message_id)",
  "policy_schema_migrations:policy_schema_migrations_pkey:p:true:true:true:true:CREATE UNIQUE INDEX policy_schema_migrations_pkey ON <schema>.policy_schema_migrations USING btree (version)",
]);

export const POLICY_SCHEMA_TRIGGERS = Object.freeze([]);
export const POLICY_SCHEMA_RULES = Object.freeze([]);
export const POLICY_SCHEMA_POLICIES = Object.freeze([]);
export const POLICY_SCHEMA_ROUTINES = Object.freeze([]);
export const POLICY_INTERNAL_FK_TRIGGERS = Object.freeze([
  "policy_execution_audit_claim_id_fkey:4:true",
  "policy_execution_claims_approval_id_fkey:4:true",
  "policy_execution_intents_claim_id_fkey:4:true",
  "policy_execution_outbox_claim_id_fkey:4:true",
]);
