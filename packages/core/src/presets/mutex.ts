import type { VisualSpecIR } from "../ast/types";

/**
 * Mutual Exclusion (Mutex) for two processes sharing a critical section lock.
 */
export const mutexSpec: VisualSpecIR = {
  schemaVersion: 1,
  moduleName: "MutexTwoProcesses",
  variables: [
    { name: "lock", type: "string", description: "Lock owner: FREE | P1 | P2" },
    { name: "p1", type: "string", description: "P1 state: IDLE | WAITING | CRITICAL" },
    { name: "p2", type: "string", description: "P2 state: IDLE | WAITING | CRITICAL" },
  ],
  initialStates: [{ lock: "FREE", p1: "IDLE", p2: "IDLE" }],
  actions: [
    {
      id: "p1_req",
      name: "P1_RequestLock",
      position: { x: 80, y: 160 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p1" },
        right: { kind: "Literal", value: "IDLE" },
      },
      effects: [{ targetVar: "p1", expression: { kind: "Literal", value: "WAITING" } }],
    },
    {
      id: "p1_acq",
      name: "P1_AcquireLock",
      position: { x: 80, y: 290 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p1" },
          right: { kind: "Literal", value: "WAITING" },
        },
        right: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "lock" },
          right: { kind: "Literal", value: "FREE" },
        },
      },
      effects: [
        { targetVar: "lock", expression: { kind: "Literal", value: "P1" } },
        { targetVar: "p1", expression: { kind: "Literal", value: "CRITICAL" } },
      ],
    },
    {
      id: "p1_rel",
      name: "P1_ReleaseLock",
      position: { x: 80, y: 420 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p1" },
        right: { kind: "Literal", value: "CRITICAL" },
      },
      effects: [
        { targetVar: "lock", expression: { kind: "Literal", value: "FREE" } },
        { targetVar: "p1", expression: { kind: "Literal", value: "IDLE" } },
      ],
    },
    {
      id: "p2_req",
      name: "P2_RequestLock",
      position: { x: 380, y: 160 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p2" },
        right: { kind: "Literal", value: "IDLE" },
      },
      effects: [{ targetVar: "p2", expression: { kind: "Literal", value: "WAITING" } }],
    },
    {
      id: "p2_acq",
      name: "P2_AcquireLock",
      position: { x: 380, y: 290 },
      guard: {
        kind: "BinaryOp",
        op: "&&",
        left: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "p2" },
          right: { kind: "Literal", value: "WAITING" },
        },
        right: {
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: "lock" },
          right: { kind: "Literal", value: "FREE" },
        },
      },
      effects: [
        { targetVar: "lock", expression: { kind: "Literal", value: "P2" } },
        { targetVar: "p2", expression: { kind: "Literal", value: "CRITICAL" } },
      ],
    },
    {
      id: "p2_rel",
      name: "P2_ReleaseLock",
      position: { x: 380, y: 420 },
      guard: {
        kind: "BinaryOp",
        op: "==",
        left: { kind: "Var", name: "p2" },
        right: { kind: "Literal", value: "CRITICAL" },
      },
      effects: [
        { targetVar: "lock", expression: { kind: "Literal", value: "FREE" } },
        { targetVar: "p2", expression: { kind: "Literal", value: "IDLE" } },
      ],
    },
  ],
  invariants: [
    {
      id: "mutual_exclusion",
      description: "P1 and P2 never enter the critical section simultaneously",
      predicate: {
        kind: "UnaryOp",
        op: "!",
        operand: {
          kind: "BinaryOp",
          op: "&&",
          left: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "p1" },
            right: { kind: "Literal", value: "CRITICAL" },
          },
          right: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "p2" },
            right: { kind: "Literal", value: "CRITICAL" },
          },
        },
      },
    },
  ],
  livenessProperties: [],
};
