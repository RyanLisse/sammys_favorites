export class ExecutionCompletionConflictError extends Error {
  readonly actualRowCount: number;
  readonly claimId: string;
  readonly expectedRowCount: "at-least-one" | "exactly-one";
  readonly table:
    | "policy_execution_claims"
    | "policy_execution_intents"
    | "policy_execution_outbox";

  constructor(
    claimId: string,
    table:
      | "policy_execution_claims"
      | "policy_execution_intents"
      | "policy_execution_outbox",
    expectedRowCount: "at-least-one" | "exactly-one",
    actualRowCount: number
  ) {
    super(
      `Execution completion conflict for ${table} and claim ${claimId}: ` +
        `expected ${expectedRowCount} row, affected ${actualRowCount}`
    );
    this.name = "ExecutionCompletionConflictError";
    this.actualRowCount = actualRowCount;
    this.claimId = claimId;
    this.expectedRowCount = expectedRowCount;
    this.table = table;
  }
}
