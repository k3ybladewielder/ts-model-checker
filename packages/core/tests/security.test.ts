import { describe, expect, it } from "vitest";
import {
  applyStateDelta,
  evaluateExpr,
  exprToTla,
  hasValidationErrors,
  validateSpec,
  type ExprNode,
  type VisualSpecIR,
} from "../src";

describe("Security hardening & defensive tests", () => {
  it("blocks __proto__, constructor, and prototype in variable declarations", () => {
    for (const forbidden of ["__proto__", "constructor", "prototype"]) {
      const spec: VisualSpecIR = {
        schemaVersion: 1,
        moduleName: "ProtoTest",
        variables: [{ name: forbidden, type: "number" }],
        initialStates: [{ [forbidden]: 1 }],
        actions: [],
        invariants: [],
        livenessProperties: [],
      };
      const issues = validateSpec(spec);
      expect(hasValidationErrors(issues)).toBe(true);
      expect(issues.some((i) => i.code === "INVALID_VAR_NAME")).toBe(true);
    }
  });

  it("prevents prototype manipulation in applyStateDelta and RecordLiteral", () => {
    const next = applyStateDelta({ a: 1 }, { ["__proto__"]: { polluted: true } } as Record<string, number>);
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect((next as Record<string, unknown>).polluted).toBeUndefined();

    expect(() =>
      evaluateExpr(
        {
          kind: "RecordLiteral",
          fields: { ["__proto__"]: { kind: "Literal", value: 1 } },
        },
        {}
      )
    ).toThrow(/Forbidden record field/);
  });

  it("rejects deeply nested ASTs to prevent stack overflow DoS", () => {
    let deep: ExprNode = { kind: "Literal", value: true };
    for (let i = 0; i < 300; i++) {
      deep = { kind: "UnaryOp", op: "!", operand: deep };
    }
    expect(() => evaluateExpr(deep, {})).toThrow(/maximum recursion depth/);
  });

  it("rejects excessive Range sizes to prevent memory exhaustion", () => {
    expect(() =>
      evaluateExpr(
        {
          kind: "Range",
          start: { kind: "Literal", value: 1 },
          end: { kind: "Literal", value: 100_000 },
        },
        {}
      )
    ).toThrow(/exceeds maximum allowed/);
  });

  it("sanitizes FieldAccess and Quantifier identifiers in TLA+ transpiler", () => {
    const tla = exprToTla({
      kind: "Quantifier",
      quantifier: "FORALL",
      boundVar: "x; (* inject *)",
      domain: { kind: "SetLiteral", elements: [{ kind: "Literal", value: 1 }] },
      predicate: {
        kind: "FieldAccess",
        target: { kind: "Var", name: "rec" },
        field: "a\nMalicious == TRUE",
      },
    });
    expect(tla).not.toContain("\n");
    expect(tla).not.toContain(";");
  });
});
