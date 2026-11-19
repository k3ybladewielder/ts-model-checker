import type { VisualSpecIR } from "../ast/types";

/**
 * Classic concurrency race condition:
 * Two processes check `balance >= 80` before debiting, allowing `balance` to become -60.
 */
export const concurrentTransferBuggySpec: VisualSpecIR = {
  schemaVersion: 1,
  moduleName: "ConcurrentTransferBuggy",
  variables: [
    { name: "balance", type: "number", description: "Account balance" },
    { name: "p1", type: "string", description: "Process 1 state" },
    { name: "p2", type: "string", description: "Process 2 state" },
  ],
  initialStates: [{ balance: 100, p1: "IDLE", p2: "IDLE" }],
  actions: [
    {
      id: "p1_check",
      name: "P1_CheckBalance",
      description: "P1 reads balance >= 80",
      position: { x: 80, y: 180 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p1" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: ">=",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        { targetVar: "p1", expression: { kind: "Literal", value: "AUTHORIZED" } },
      ],
    },
    {
      id: "p1_debit",
      name: "P1_Debit",
      description: "P1 debits 80 from balance",
      position: { x: 80, y: 340 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p1" },
        right: { kind: "Literal", value: "AUTHORIZED" },
      },
      effects: [
        {
          targetVar: "balance",
          expression: {
            kind: "BinaryOp",
            op: "-",
            left: { kind: "Var", name: "balance" },
            right: { kind: "Literal", value: 80 },
          },
        },
        { targetVar: "p1", expression: { kind: "Literal", value: "COMPLETED" } },
      ],
    },
    {
      id: "p2_check",
      name: "P2_CheckBalance",
      description: "P2 reads balance >= 80",
      position: { x: 380, y: 180 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p2" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: ">=",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        { targetVar: "p2", expression: { kind: "Literal", value: "AUTHORIZED" } },
      ],
    },
    {
      id: "p2_debit",
      name: "P2_Debit",
      description: "P2 debits 80 from balance",
      position: { x: 380, y: 340 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p2" },
        right: { kind: "Literal", value: "AUTHORIZED" },
      },
      effects: [
        {
          targetVar: "balance",
          expression: {
            kind: "BinaryOp",
            op: "-",
            left: { kind: "Var", name: "balance" },
            right: { kind: "Literal", value: 80 },
          },
        },
        { targetVar: "p2", expression: { kind: "Literal", value: "COMPLETED" } },
      ],
    },
    {
      id: "p1_reject",
      name: "P1_RejectInsufficientFunds",
      description: "P1 rejects when balance < 80",
      position: { x: 80, y: 490 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p1" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: "<",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        { targetVar: "p1", expression: { kind: "Literal", value: "REJECTED" } },
      ],
    },
    {
      id: "p2_reject",
      name: "P2_RejectInsufficientFunds",
      description: "P2 rejects when balance < 80",
      position: { x: 380, y: 490 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p2" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: "<",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        { targetVar: "p2", expression: { kind: "Literal", value: "REJECTED" } },
      ],
    },
  ],
  invariants: [
    {
      id: "balance_non_negative",
      description: "Balance must never become negative",
      predicate: {
        kind: "BinaryOp",
        op: ">=",
        left: { kind: "Var", name: "balance" },
        right: { kind: "Literal", value: 0 },
      },
    },
  ],
  livenessProperties: [],
  terminalCondition: {
    kind: "BinaryOp",
    op: "&&",
    left: {
      kind: "BinaryOp",
      op: "||",
      left: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p1" },
        right: { kind: "Literal", value: "COMPLETED" },
      },
      right: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p1" },
        right: { kind: "Literal", value: "REJECTED" },
      },
    },
    right: {
      kind: "BinaryOp",
      op: "||",
      left: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p2" },
        right: { kind: "Literal", value: "COMPLETED" },
      },
      right: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p2" },
        right: { kind: "Literal", value: "REJECTED" },
      },
    },
  },
};

/**
 * Fixed version using atomic check-and-debit transitions,
 * rejecting insufficient funds cleanly.
 */
export const concurrentTransferFixedSpec: VisualSpecIR = {
  ...concurrentTransferBuggySpec,
  moduleName: "ConcurrentTransferFixed",
  actions: [
    {
      id: "p1_atomic",
      name: "P1_AtomicDebit",
      description: "P1 checks and debits atomically",
      position: { x: 80, y: 200 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p1" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: ">=",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        {
          targetVar: "balance",
          expression: {
            kind: "BinaryOp",
            op: "-",
            left: { kind: "Var", name: "balance" },
            right: { kind: "Literal", value: 80 },
          },
        },
        { targetVar: "p1", expression: { kind: "Literal", value: "COMPLETED" } },
      ],
    },
    {
      id: "p1_reject",
      name: "P1_RejectInsufficientFunds",
      description: "P1 rejects when balance < 80",
      position: { x: 80, y: 360 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p1" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: "<",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        { targetVar: "p1", expression: { kind: "Literal", value: "REJECTED" } },
      ],
    },
    {
      id: "p2_atomic",
      name: "P2_AtomicDebit",
      description: "P2 checks and debits atomically",
      position: { x: 380, y: 200 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p2" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: ">=",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        {
          targetVar: "balance",
          expression: {
            kind: "BinaryOp",
            op: "-",
            left: { kind: "Var", name: "balance" },
            right: { kind: "Literal", value: 80 },
          },
        },
        { targetVar: "p2", expression: { kind: "Literal", value: "COMPLETED" } },
      ],
    },
    {
      id: "p2_reject",
      name: "P2_RejectInsufficientFunds",
      description: "P2 rejects when balance < 80",
      position: { x: 380, y: 360 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p2" },
          right: { kind: "Literal", value: "IDLE" },
        },
        right: {
          kind: "BinaryOp",
          op: "<",
          left: { kind: "Var", name: "balance" },
          right: { kind: "Literal", value: 80 },
        },
      },
      effects: [
        { targetVar: "p2", expression: { kind: "Literal", value: "REJECTED" } },
      ],
    },
  ],
  terminalCondition: {
    kind: "BinaryOp",
    op: "&&",
    left: {
      kind: "BinaryOp",
      op: "!=",
      left: { kind: "Var", name: "p1" },
      right: { kind: "Literal", value: "IDLE" },
    },
    right: {
      kind: "BinaryOp",
      op: "!=",
      left: { kind: "Var", name: "p2" },
      right: { kind: "Literal", value: "IDLE" },
    },
  },
};
