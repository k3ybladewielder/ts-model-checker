import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  compileAction,
  deepEqual,
  evaluateExpr,
  normalizeSet,
  type ExprNode,
  type State,
} from "../src";

describe("canonicalHash & normalizeSet", () => {
  it("produces identical hashes regardless of object key order", () => {
    const a: State = { saldo: 100, status: "IDLE", meta: { x: 1, y: 2 } };
    const b: State = { meta: { y: 2, x: 1 }, status: "IDLE", saldo: 100 };
    expect(canonicalHash(a)).toBe(canonicalHash(b));
    expect(deepEqual(a, b)).toBe(true);
  });

  it("normalizes -0 to 0", () => {
    expect(canonicalHash(-0)).toBe("0");
    expect(deepEqual(-0, 0)).toBe(true);
  });

  it("deduplicates and canonically orders sets", () => {
    const setA = normalizeSet([3, 1, 2, 1, 3]);
    const setB = normalizeSet([2, 3, 1]);
    expect(deepEqual(setA, setB)).toBe(true);
    expect(setA).toHaveLength(3);
  });
});

describe("evaluateExpr (eval-free AST)", () => {
  const baseState: State = {
    x: 10,
    y: 3,
    flag: true,
    items: [1, 2, 3],
    user: { name: "Alice", role: "ADMIN" },
  };

  it("evaluates literals, variables, and field access", () => {
    expect(evaluateExpr({ kind: "Literal", value: 42 }, baseState)).toBe(42);
    expect(evaluateExpr({ kind: "Var", name: "x" }, baseState)).toBe(10);
    expect(
      evaluateExpr(
        {
          kind: "FieldAccess",
          target: { kind: "Var", name: "user" },
          field: "role",
        },
        baseState
      )
    ).toBe("ADMIN");
  });

  it("evaluates arithmetic, comparison, and boolean implication", () => {
    const divExpr: ExprNode = {
      kind: "BinaryOp",
      op: "/",
      left: { kind: "Var", name: "x" },
      right: { kind: "Var", name: "y" },
    };
    expect(evaluateExpr(divExpr, baseState)).toBe(3); // integer division like TLA+ \div

    const impliesFalseToAnything: ExprNode = {
      kind: "BinaryOp",
      op: "=>",
      left: { kind: "Literal", value: false },
      right: { kind: "Var", name: "nonExistentVar" }, // short-circuit!
    };
    expect(evaluateExpr(impliesFalseToAnything, baseState)).toBe(true);
  });

  it("evaluates set operations, Range, and CARDINALITY", () => {
    const rangeExpr: ExprNode = {
      kind: "Range",
      start: { kind: "Literal", value: 1 },
      end: { kind: "Literal", value: 4 },
    };
    expect(evaluateExpr(rangeExpr, baseState)).toEqual([1, 2, 3, 4]);

    const diffExpr: ExprNode = {
      kind: "BinaryOp",
      op: "DIFF",
      left: rangeExpr,
      right: { kind: "Var", name: "items" },
    };
    expect(evaluateExpr(diffExpr, baseState)).toEqual([4]);

    const cardExpr: ExprNode = {
      kind: "UnaryOp",
      op: "CARDINALITY",
      operand: { kind: "Var", name: "items" },
    };
    expect(evaluateExpr(cardExpr, baseState)).toBe(3);
  });

  it("evaluates FORALL and EXISTS quantifiers with bound variables", () => {
    const forallPositive: ExprNode = {
      kind: "Quantifier",
      quantifier: "FORALL",
      boundVar: "n",
      domain: { kind: "Var", name: "items" },
      predicate: {
        kind: "BinaryOp",
        op: ">",
        left: { kind: "Var", name: "n" },
        right: { kind: "Literal", value: 0 },
      },
    };
    expect(evaluateExpr(forallPositive, baseState)).toBe(true);

    const existsGt2: ExprNode = {
      kind: "Quantifier",
      quantifier: "EXISTS",
      boundVar: "n",
      domain: { kind: "Var", name: "items" },
      predicate: {
        kind: "BinaryOp",
        op: ">",
        left: { kind: "Var", name: "n" },
        right: { kind: "Literal", value: 2 },
      },
    };
    expect(evaluateExpr(existsGt2, baseState)).toBe(true);
  });

  it("throws on division by zero or uninitialized variable", () => {
    expect(() =>
      evaluateExpr(
        {
          kind: "BinaryOp",
          op: "/",
          left: { kind: "Literal", value: 10 },
          right: { kind: "Literal", value: 0 },
        },
        baseState
      )
    ).toThrow(/Division by zero/);

    expect(() =>
      evaluateExpr({ kind: "Var", name: "missing" }, baseState)
    ).toThrow(/Uninitialized variable/);
  });

  it("compiles actions with simultaneous effect evaluation", () => {
    // Classic swap: x' = y, y' = x
    const swap = compileAction({
      id: "swap",
      name: "Swap",
      guard: { kind: "Literal", value: true },
      effects: [
        { targetVar: "x", expression: { kind: "Var", name: "y" } },
        { targetVar: "y", expression: { kind: "Var", name: "x" } },
      ],
    });

    expect(swap.guard(baseState)).toBe(true);
    expect(swap.effect(baseState)).toEqual({ x: 3, y: 10 });
  });
});
