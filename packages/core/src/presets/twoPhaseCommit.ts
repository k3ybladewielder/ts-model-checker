import type { VisualSpecIR } from "../ast/types";

/**
 * Two-Phase Commit (2PC) simplified with Coordinator + 2 Resource Managers (rm1, rm2).
 */
export const twoPhaseCommitSpec: VisualSpecIR = {
  schemaVersion: 1,
  moduleName: "TwoPhaseCommit",
  variables: [
    { name: "tmState", type: "string", description: "Transaction Manager: INIT | COMMITTED | ABORTED" },
    { name: "rm1", type: "string", description: "RM1: WORKING | PREPARED | COMMITTED | ABORTED" },
    { name: "rm2", type: "string", description: "RM2: WORKING | PREPARED | COMMITTED | ABORTED" },
  ],
  initialStates: [{ tmState: "INIT", rm1: "WORKING", rm2: "WORKING" }],
  actions: [
    {
      id: "rm1_prepare",
      name: "RM1_Prepare",
      position: { x: 60, y: 160 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "tmState" },
          right: { kind: "Literal", value: "INIT" },
        },
        right: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "rm1" },
          right: { kind: "Literal", value: "WORKING" },
        },
      },
      effects: [{ targetVar: "rm1", expression: { kind: "Literal", value: "PREPARED" } }],
    },
    {
      id: "rm2_prepare",
      name: "RM2_Prepare",
      position: { x: 360, y: 160 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "tmState" },
          right: { kind: "Literal", value: "INIT" },
        },
        right: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "rm2" },
          right: { kind: "Literal", value: "WORKING" },
        },
      },
      effects: [{ targetVar: "rm2", expression: { kind: "Literal", value: "PREPARED" } }],
    },
    {
      id: "tm_commit",
      name: "TM_Commit",
      position: { x: 60, y: 310 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "tmState" },
          right: { kind: "Literal", value: "INIT" },
        },
        right: {
          kind: "BinaryOp",
          op: "&&",
          left: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "rm1" },
            right: { kind: "Literal", value: "PREPARED" },
          },
          right: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "rm2" },
            right: { kind: "Literal", value: "PREPARED" },
          },
        },
      },
      effects: [
        { targetVar: "tmState", expression: { kind: "Literal", value: "COMMITTED" } },
        { targetVar: "rm1", expression: { kind: "Literal", value: "COMMITTED" } },
        { targetVar: "rm2", expression: { kind: "Literal", value: "COMMITTED" } },
      ],
    },
    {
      id: "tm_abort",
      name: "TM_Abort",
      position: { x: 360, y: 310 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "tmState" },
        right: { kind: "Literal", value: "INIT" },
      },
      effects: [
        { targetVar: "tmState", expression: { kind: "Literal", value: "ABORTED" } },
        { targetVar: "rm1", expression: { kind: "Literal", value: "ABORTED" } },
        { targetVar: "rm2", expression: { kind: "Literal", value: "ABORTED" } },
      ],
    },
  ],
  invariants: [
    {
      id: "consistency",
      description: "No participant commits while another aborts",
      predicate: {
        kind: "UnaryOp",
        op: "!",
        operand: {
          kind: "BinaryOp",
          op: "||",
          left: {
            kind: "BinaryOp",
            op: "&&",
            left: {
              kind: "BinaryOp",
              op: "==",
              left: { kind: "Var", name: "rm1" },
              right: { kind: "Literal", value: "COMMITTED" },
            },
            right: {
              kind: "BinaryOp",
              op: "==",
              left: { kind: "Var", name: "rm2" },
              right: { kind: "Literal", value: "ABORTED" },
            },
          },
          right: {
            kind: "BinaryOp",
            op: "&&",
            left: {
              kind: "BinaryOp",
              op: "==",
              left: { kind: "Var", name: "rm1" },
              right: { kind: "Literal", value: "ABORTED" },
            },
            right: {
              kind: "BinaryOp",
              op: "==",
              left: { kind: "Var", name: "rm2" },
              right: { kind: "Literal", value: "COMMITTED" },
            },
          },
        },
      },
    },
  ],
  livenessProperties: [
    {
      id: "decision_reached",
      kind: "EVENTUALLY",
      description: "Transaction eventually reaches a decision (COMMITTED or ABORTED)",
      eventually: {
        kind: "BinaryOp",
        op: "!=",
        left: { kind: "Var", name: "tmState" },
        right: { kind: "Literal", value: "INIT" },
      },
    },
  ],
  terminalCondition: {
    kind: "BinaryOp",
    op: "!=",
    left: { kind: "Var", name: "tmState" },
    right: { kind: "Literal", value: "INIT" },
  },
};
