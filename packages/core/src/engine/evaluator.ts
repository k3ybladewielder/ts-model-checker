import type { ExprNode, State, StateValue } from "../ast/types";
import { deepEqual, normalizeSet } from "./canonicalHash";

const MAX_RANGE_SIZE = 10_000;
const MAX_AST_DEPTH = 256;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertNumber(val: StateValue, context: string): number {
  if (typeof val !== "number" || Number.isNaN(val)) {
    throw new Error(`${context} requires a valid number, received ${typeof val}`);
  }
  return val;
}

function assertArray(val: StateValue, context: string): readonly StateValue[] {
  if (!Array.isArray(val)) {
    throw new Error(`${context} requires a set/list, received ${typeof val}`);
  }
  return val;
}

/**
 * Pure, eval-free recursive AST evaluator against an immutable State.
 * Optional `boundEnv` holds quantifier-bound variables.
 */
export function evaluateExpr(
  node: ExprNode,
  state: State,
  boundEnv: Readonly<Record<string, StateValue>> = {},
  depth = 0
): StateValue {
  if (depth > MAX_AST_DEPTH) {
    throw new Error(`Expression AST exceeds maximum recursion depth (${MAX_AST_DEPTH})`);
  }

  switch (node.kind) {
    case "Literal":
      return node.value;

    case "Var": {
      if (Object.prototype.hasOwnProperty.call(boundEnv, node.name)) {
        return boundEnv[node.name];
      }
      if (Object.prototype.hasOwnProperty.call(state, node.name)) {
        return state[node.name];
      }
      throw new Error(`Uninitialized variable in state: '${node.name}'`);
    }

    case "SetLiteral": {
      const evaluated = node.elements.map((el) =>
        evaluateExpr(el, state, boundEnv, depth + 1)
      );
      return normalizeSet(evaluated);
    }

    case "RecordLiteral": {
      const result: Record<string, StateValue> = {};
      for (const [key, expr] of Object.entries(node.fields)) {
        if (FORBIDDEN_KEYS.has(key)) {
          throw new Error(`Forbidden record field name: '${key}'`);
        }
        Object.defineProperty(result, key, {
          value: evaluateExpr(expr, state, boundEnv, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return Object.freeze(result);
    }

    case "FieldAccess": {
      if (FORBIDDEN_KEYS.has(node.field)) {
        throw new Error(`Forbidden field access: '${node.field}'`);
      }
      const target = evaluateExpr(node.target, state, boundEnv, depth + 1);
      if (target === null || typeof target !== "object" || Array.isArray(target)) {
        throw new Error(`Field access '.${node.field}' requires a record`);
      }
      const record = target as Record<string, StateValue>;
      if (!Object.prototype.hasOwnProperty.call(record, node.field)) {
        throw new Error(`Field '${node.field}' does not exist on record`);
      }
      return record[node.field];
    }

    case "Range": {
      const start = assertNumber(evaluateExpr(node.start, state, boundEnv, depth + 1), "Range start");
      const end = assertNumber(evaluateExpr(node.end, state, boundEnv, depth + 1), "Range end");
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error("Range bounds must be integers");
      }
      if (end < start) {
        return Object.freeze([]);
      }
      const size = end - start + 1;
      if (size > MAX_RANGE_SIZE) {
        throw new Error(`Range size (${size}) exceeds maximum allowed (${MAX_RANGE_SIZE})`);
      }
      const items: number[] = [];
      for (let i = start; i <= end; i++) {
        items.push(i);
      }
      return Object.freeze(items);
    }

    case "UnaryOp": {
      const val = evaluateExpr(node.operand, state, boundEnv, depth + 1);
      switch (node.op) {
        case "!":
          return !Boolean(val);
        case "-":
          return -assertNumber(val, "Unary '-'");
        case "CARDINALITY":
          return assertArray(val, "CARDINALITY").length;
        case "IS_EMPTY":
          return assertArray(val, "IS_EMPTY").length === 0;
      }
    }

    case "BinaryOp": {
      if (node.op === "&&") {
        return (
          Boolean(evaluateExpr(node.left, state, boundEnv, depth + 1)) &&
          Boolean(evaluateExpr(node.right, state, boundEnv, depth + 1))
        );
      }
      if (node.op === "||") {
        return (
          Boolean(evaluateExpr(node.left, state, boundEnv, depth + 1)) ||
          Boolean(evaluateExpr(node.right, state, boundEnv, depth + 1))
        );
      }
      if (node.op === "=>") {
        const antecedent = Boolean(evaluateExpr(node.left, state, boundEnv, depth + 1));
        return !antecedent || Boolean(evaluateExpr(node.right, state, boundEnv, depth + 1));
      }

      const left = evaluateExpr(node.left, state, boundEnv, depth + 1);
      const right = evaluateExpr(node.right, state, boundEnv, depth + 1);

      switch (node.op) {
        case "==":
          return deepEqual(left, right);
        case "!=":
          return !deepEqual(left, right);
        case "<":
          return assertNumber(left, "Operator '<'") < assertNumber(right, "Operator '<'");
        case "<=":
          return assertNumber(left, "Operator '<='") <= assertNumber(right, "Operator '<='");
        case ">":
          return assertNumber(left, "Operator '>'") > assertNumber(right, "Operator '>'");
        case ">=":
          return assertNumber(left, "Operator '>='") >= assertNumber(right, "Operator '>='");
        case "+":
          return assertNumber(left, "Operator '+'") + assertNumber(right, "Operator '+'");
        case "-":
          return assertNumber(left, "Operator '-'") - assertNumber(right, "Operator '-'");
        case "*":
          return assertNumber(left, "Operator '*'") * assertNumber(right, "Operator '*'");
        case "/": {
          const divisor = assertNumber(right, "Operator '/'");
          if (divisor === 0) {
            throw new Error("Division by zero during formal evaluation");
          }
          return Math.trunc(assertNumber(left, "Operator '/'") / divisor);
        }
        case "%": {
          const divisor = assertNumber(right, "Operator '%'");
          if (divisor === 0) {
            throw new Error("Modulo by zero during formal evaluation");
          }
          return assertNumber(left, "Operator '%'") % divisor;
        }
        case "IN": {
          const set = assertArray(right, "Operator 'IN'");
          return set.some((item) => deepEqual(left, item));
        }
        case "NOT_IN": {
          const set = assertArray(right, "Operator 'NOT_IN'");
          return !set.some((item) => deepEqual(left, item));
        }
        case "UNION": {
          const s1 = assertArray(left, "Operator 'UNION'");
          const s2 = assertArray(right, "Operator 'UNION'");
          return normalizeSet([...s1, ...s2]);
        }
        case "INTERSECT": {
          const s1 = assertArray(left, "Operator 'INTERSECT'");
          const s2 = assertArray(right, "Operator 'INTERSECT'");
          return normalizeSet(s1.filter((a) => s2.some((b) => deepEqual(a, b))));
        }
        case "DIFF": {
          const s1 = assertArray(left, "Operator 'DIFF'");
          const s2 = assertArray(right, "Operator 'DIFF'");
          return normalizeSet(s1.filter((a) => !s2.some((b) => deepEqual(a, b))));
        }
        case "SUBSET_EQ": {
          const s1 = assertArray(left, "Operator 'SUBSET_EQ'");
          const s2 = assertArray(right, "Operator 'SUBSET_EQ'");
          return s1.every((a) => s2.some((b) => deepEqual(a, b)));
        }
      }
    }

    case "IfThenElse": {
      const cond = Boolean(evaluateExpr(node.condition, state, boundEnv, depth + 1));
      return cond
        ? evaluateExpr(node.thenBranch, state, boundEnv, depth + 1)
        : evaluateExpr(node.elseBranch, state, boundEnv, depth + 1);
    }

    case "Quantifier": {
      if (FORBIDDEN_KEYS.has(node.boundVar)) {
        throw new Error(`Forbidden quantifier variable name: '${node.boundVar}'`);
      }
      const domain = assertArray(
        evaluateExpr(node.domain, state, boundEnv, depth + 1),
        `Quantifier ${node.quantifier} domain`
      );
      if (node.quantifier === "FORALL") {
        for (const item of domain) {
          const nextEnv = { ...boundEnv };
          Object.defineProperty(nextEnv, node.boundVar, {
            value: item,
            enumerable: true,
            writable: true,
            configurable: true,
          });
          if (!Boolean(evaluateExpr(node.predicate, state, nextEnv, depth + 1))) {
            return false;
          }
        }
        return true;
      } else {
        for (const item of domain) {
          const nextEnv = { ...boundEnv };
          Object.defineProperty(nextEnv, node.boundVar, {
            value: item,
            enumerable: true,
            writable: true,
            configurable: true,
          });
          if (Boolean(evaluateExpr(node.predicate, state, nextEnv, depth + 1))) {
            return true;
          }
        }
        return false;
      }
    }
  }
}
