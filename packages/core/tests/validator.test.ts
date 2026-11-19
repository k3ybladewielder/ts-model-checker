import { describe, expect, it } from "vitest";
import { hasValidationErrors, validateSpec, type VisualSpecIR } from "../src";

const validSpec: VisualSpecIR = {
  schemaVersion: 1,
  moduleName: "ValidCounter",
  variables: [{ name: "count", type: "number" }],
  initialStates: [{ count: 0 }],
  actions: [
    {
      id: "inc",
      name: "Increment",
      guard: {
        kind: "BinaryOp",
        op: "<",
        left: { kind: "Var", name: "count" },
        right: { kind: "Literal", value: 5 },
      },
      effects: [
        {
          targetVar: "count",
          expression: {
            kind: "BinaryOp",
            op: "+",
            left: { kind: "Var", name: "count" },
            right: { kind: "Literal", value: 1 },
          },
        },
      ],
    },
  ],
  invariants: [
    {
      id: "non_neg",
      description: "Count is never negative",
      predicate: {
        kind: "BinaryOp",
        op: ">=",
        left: { kind: "Var", name: "count" },
        right: { kind: "Literal", value: 0 },
      },
    },
  ],
  livenessProperties: [],
};

describe("validateSpec", () => {
  it("returns no errors for a valid specification", () => {
    const issues = validateSpec(validSpec);
    expect(hasValidationErrors(issues)).toBe(false);
    expect(issues).toHaveLength(0);
  });

  it("detects undeclared variables in guards and effects", () => {
    const badSpec: VisualSpecIR = {
      ...validSpec,
      actions: [
        {
          id: "bad",
          name: "BadAction",
          guard: { kind: "Var", name: "unknownVar" },
          effects: [
            {
              targetVar: "missingTarget",
              expression: { kind: "Literal", value: 1 },
            },
          ],
        },
      ],
    };
    const issues = validateSpec(badSpec);
    expect(hasValidationErrors(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("UNDECLARED_VAR");
    expect(issues.map((i) => i.code)).toContain("UNDECLARED_TARGET_VAR");
  });

  it("allows quantifier bound variables inside predicates", () => {
    const quantSpec: VisualSpecIR = {
      ...validSpec,
      invariants: [
        {
          id: "q",
          description: "All elements in range are >= 1",
          predicate: {
            kind: "Quantifier",
            quantifier: "FORALL",
            boundVar: "i",
            domain: {
              kind: "Range",
              start: { kind: "Literal", value: 1 },
              end: { kind: "Literal", value: 3 },
            },
            predicate: {
              kind: "BinaryOp",
              op: ">=",
              left: { kind: "Var", name: "i" },
              right: { kind: "Literal", value: 1 },
            },
          },
        },
      ],
    };
    const issues = validateSpec(quantSpec);
    expect(hasValidationErrors(issues)).toBe(false);
  });

  it("detects duplicate variable assignments in a single action", () => {
    const dupAssignSpec: VisualSpecIR = {
      ...validSpec,
      actions: [
        {
          id: "dup",
          name: "DupAssign",
          guard: { kind: "Literal", value: true },
          effects: [
            { targetVar: "count", expression: { kind: "Literal", value: 1 } },
            { targetVar: "count", expression: { kind: "Literal", value: 2 } },
          ],
        },
      ],
    };
    const issues = validateSpec(dupAssignSpec);
    expect(hasValidationErrors(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("DUPLICATE_ASSIGNMENT");
  });
});
