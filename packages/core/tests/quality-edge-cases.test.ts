import { describe, expect, it, vi } from "vitest";
import {
  evaluateExpr,
  validateSpec,
  verifySpec,
  type State,
  type VisualSpecIR,
} from "../src";

describe("Quality & Edge-Case Coverage", () => {
  const state: State = {
    a: [1, 2, 3],
    b: [2, 3, 4],
    empty: [],
    rec: { count: 5, active: true },
  };

  it("covers all remaining set, record, and conditional operators in evaluator", () => {
    expect(
      evaluateExpr(
        {
          kind: "BinaryOp",
          op: "INTERSECT",
          left: { kind: "Var", name: "a" },
          right: { kind: "Var", name: "b" },
        },
        state
      )
    ).toEqual([2, 3]);

    expect(
      evaluateExpr(
        {
          kind: "BinaryOp",
          op: "SUBSET_EQ",
          left: {
            kind: "SetLiteral",
            elements: [{ kind: "Literal", value: 2 }],
          },
          right: { kind: "Var", name: "a" },
        },
        state
      )
    ).toBe(true);

    expect(
      evaluateExpr(
        {
          kind: "BinaryOp",
          op: "NOT_IN",
          left: { kind: "Literal", value: 99 },
          right: { kind: "Var", name: "a" },
        },
        state
      )
    ).toBe(true);

    expect(
      evaluateExpr(
        { kind: "UnaryOp", op: "IS_EMPTY", operand: { kind: "Var", name: "empty" } },
        state
      )
    ).toBe(true);

    expect(
      evaluateExpr(
        {
          kind: "IfThenElse",
          condition: {
            kind: "FieldAccess",
            target: { kind: "Var", name: "rec" },
            field: "active",
          },
          thenBranch: {
            kind: "RecordLiteral",
            fields: { ok: { kind: "Literal", value: true } },
          },
          elseBranch: {
            kind: "RecordLiteral",
            fields: { ok: { kind: "Literal", value: false } },
          },
        },
        state
      )
    ).toEqual({ ok: true });
  });

  it("detects invariant violation already in initial state", () => {
    const badInitSpec: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "BadInit",
      variables: [{ name: "x", type: "number" }],
      initialStates: [{ x: -1 }],
      actions: [],
      invariants: [
        {
          id: "pos",
          description: "x >= 0",
          predicate: {
            kind: "BinaryOp",
            op: ">=",
            left: { kind: "Var", name: "x" },
            right: { kind: "Literal", value: 0 },
          },
        },
      ],
      livenessProperties: [],
    };

    const res = verifySpec(badInitSpec);
    expect(res.status).toBe("INVARIANT_VIOLATED");
    if (res.status === "INVARIANT_VIOLATED") {
      expect(res.counterexample).toHaveLength(1);
    }
  });

  it("supports checkDeadlocks: false, onProgress, and isAborted", () => {
    const onProgress = vi.fn();
    const spec: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "ProgressDemo",
      variables: [{ name: "n", type: "number" }],
      initialStates: [{ n: 0 }],
      actions: [
        {
          id: "inc",
          name: "Inc",
          guard: {
            kind: "BinaryOp",
            op: "<",
            left: { kind: "Var", name: "n" },
            right: { kind: "Literal", value: 5 },
          },
          effects: [
            {
              targetVar: "n",
              expression: {
                kind: "BinaryOp",
                op: "+",
                left: { kind: "Var", name: "n" },
                right: { kind: "Literal", value: 1 },
              },
            },
          ],
        },
      ],
      invariants: [],
      livenessProperties: [],
    };

    const passed = verifySpec(spec, {
      checkDeadlocks: false,
      progressInterval: 2,
      onProgress,
    });
    expect(passed.status).toBe("PASSED");
    expect(onProgress).toHaveBeenCalled();

    const aborted = verifySpec(spec, { isAborted: () => true });
    expect(aborted.status).toBe("CANCELLED");
  });

  it("emits warnings for empty effects and missing properties in validateSpec", () => {
    const issues = validateSpec({
      schemaVersion: 1,
      moduleName: "WarnDemo",
      variables: [{ name: "x", type: "number" }],
      initialStates: [{ x: 0 }],
      actions: [
        {
          id: "noop",
          name: "NoOp",
          guard: { kind: "Literal", value: true },
          effects: [],
        },
      ],
      invariants: [],
      livenessProperties: [],
    });

    const codes = issues.map((i) => i.code);
    expect(codes).toContain("EMPTY_ACTION_EFFECTS");
    expect(codes).toContain("NO_PROPERTIES");
  });
});
