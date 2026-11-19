import type {
  CompiledAction,
  CompiledInvariant,
  CompiledSpec,
  State,
  StateValue,
  VisualActionIR,
  VisualSpecIR,
} from "../ast/types";
import { evaluateExpr } from "./evaluator";

/**
 * Compiles a serializable VisualActionIR into an executable CompiledAction.
 * All effects are evaluated simultaneously against the current state (TLA+ semantics).
 */
export function compileAction(actionIR: VisualActionIR): CompiledAction {
  return {
    id: actionIR.id,
    name: actionIR.name,
    guard: (state: State): boolean => Boolean(evaluateExpr(actionIR.guard, state)),
    effect: (state: State): Partial<State> => {
      const nextAssignments: Record<string, StateValue> = {};
      for (const assign of actionIR.effects) {
        nextAssignments[assign.targetVar] = evaluateExpr(assign.expression, state);
      }
      return nextAssignments;
    },
  };
}

/** Compiles a full VisualSpecIR into an executable CompiledSpec. */
export function compileSpec(spec: VisualSpecIR): CompiledSpec {
  const actions: CompiledAction[] = spec.actions.map(compileAction);

  const invariants: CompiledInvariant[] = spec.invariants.map((inv) => ({
    id: inv.id,
    description: inv.description,
    predicate: (state: State): boolean => Boolean(evaluateExpr(inv.predicate, state)),
  }));

  const isTerminalState = spec.terminalCondition
    ? (state: State): boolean => Boolean(evaluateExpr(spec.terminalCondition!, state))
    : undefined;

  return {
    moduleName: spec.moduleName,
    initialStates: spec.initialStates,
    actions,
    invariants,
    isTerminalState,
  };
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Applies TLA+ UNCHANGED semantics: merges current state with defined keys from delta. */
export function applyStateDelta(current: State, delta: Partial<State>): State {
  const next: Record<string, StateValue> = { ...current };
  for (const [key, value] of Object.entries(delta)) {
    if (value !== undefined && !FORBIDDEN_KEYS.has(key)) {
      Object.defineProperty(next, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return Object.freeze(next);
}
