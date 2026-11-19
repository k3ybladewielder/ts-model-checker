import type { State, VisualSpecIR } from "../ast/types";
import { hasValidationErrors, validateSpec } from "../ast/validator";
import { canonicalHash } from "./canonicalHash";
import { applyStateDelta, compileSpec } from "./compiler";

export interface TraceValidationOptions {
  /** Allow consecutive identical states without an explicit action (TLA+ stuttering). Default: true. */
  readonly allowStuttering?: boolean;
}

export type TraceValidationResult =
  | {
      readonly valid: true;
      readonly matchedActions: readonly string[];
    }
  | {
      readonly valid: false;
      readonly failedAtStep: number;
      readonly reason: string;
    };

/**
 * Validates a real-world execution log (array of states) against a formal VisualSpecIR.
 */
export function validateExecutionTrace(
  spec: VisualSpecIR,
  trace: readonly State[],
  options: TraceValidationOptions = {}
): TraceValidationResult {
  const allowStuttering = options.allowStuttering ?? true;

  if (trace.length === 0) {
    return {
      valid: false,
      failedAtStep: 0,
      reason: "Execution trace is empty.",
    };
  }

  const issues = validateSpec(spec);
  if (hasValidationErrors(issues)) {
    return {
      valid: false,
      failedAtStep: 0,
      reason: `Specification has validation errors: ${issues[0].message}`,
    };
  }

  const compiled = compileSpec(spec);

  // 1. Validate initial state
  const initHashes = new Set(compiled.initialStates.map(canonicalHash));
  const firstHash = canonicalHash(trace[0]);
  if (!initHashes.has(firstHash)) {
    return {
      valid: false,
      failedAtStep: 0,
      reason: "Initial state in trace does not match any Init state in the specification.",
    };
  }

  // Check invariants on initial state
  for (const inv of compiled.invariants) {
    if (!inv.predicate(trace[0])) {
      return {
        valid: false,
        failedAtStep: 0,
        reason: `Invariant '${inv.description}' violated at step 0.`,
      };
    }
  }

  const matchedActions: string[] = ["Init"];

  // 2. Validate each transition trace[i] -> trace[i + 1]
  for (let i = 0; i < trace.length - 1; i++) {
    const current = trace[i];
    const next = trace[i + 1];
    const nextHash = canonicalHash(next);

    let matchedAction: string | null = null;
    for (const action of compiled.actions) {
      if (!action.guard(current)) continue;
      const produced = applyStateDelta(current, action.effect(current));
      if (canonicalHash(produced) === nextHash) {
        matchedAction = action.name;
        break;
      }
    }

    if (!matchedAction) {
      if (allowStuttering && canonicalHash(current) === nextHash) {
        matchedAction = "Stutter";
      } else {
        return {
          valid: false,
          failedAtStep: i + 1,
          reason: `No enabled action transitions state #${i} to state #${i + 1}.`,
        };
      }
    }

    // Check invariants on next state
    for (const inv of compiled.invariants) {
      if (!inv.predicate(next)) {
        return {
          valid: false,
          failedAtStep: i + 1,
          reason: `Invariant '${inv.description}' violated at step ${i + 1} (after '${matchedAction}').`,
        };
      }
    }

    matchedActions.push(matchedAction);
  }

  return {
    valid: true,
    matchedActions,
  };
}
