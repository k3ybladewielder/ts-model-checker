import type {
  CompiledAction,
  CompiledInvariant,
  CompiledSpec,
  State,
  TraceStep,
  ValidationIssue,
  VisualLivenessIR,
  VisualSpecIR,
} from "../ast/types";
import { hasValidationErrors, validateSpec } from "../ast/validator";
import { canonicalHash } from "./canonicalHash";
import { applyStateDelta, compileSpec } from "./compiler";
import {
  buildTracePrefix,
  checkLivenessProperty,
  type GraphEdge,
  type LivenessViolation,
  type ParentEntry,
} from "./livenessChecker";

export interface CheckerProgress {
  readonly statesExplored: number;
  readonly transitionsEvaluated: number;
  readonly queueSize: number;
}

export interface CheckerOptions {
  readonly maxStates?: number;
  readonly checkDeadlocks?: boolean;
  readonly checkLiveness?: boolean;
  readonly progressInterval?: number;
  readonly onProgress?: (progress: CheckerProgress) => void;
  readonly isAborted?: () => boolean;
}

export type VerificationResult =
  | {
      readonly status: "PASSED";
      readonly statesExplored: number;
      readonly transitionsEvaluated: number;
      readonly durationMs: number;
    }
  | {
      readonly status: "VALIDATION_ERROR";
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly status: "INVARIANT_VIOLATED";
      readonly violatedInvariant: Pick<CompiledInvariant, "id" | "description">;
      readonly counterexample: readonly TraceStep[];
      readonly statesExplored: number;
      readonly transitionsEvaluated: number;
    }
  | {
      readonly status: "DEADLOCK";
      readonly counterexample: readonly TraceStep[];
      readonly statesExplored: number;
      readonly transitionsEvaluated: number;
    }
  | {
      readonly status: "LIVENESS_VIOLATED";
      readonly violation: LivenessViolation;
      readonly statesExplored: number;
      readonly transitionsEvaluated: number;
    }
  | {
      readonly status: "LIMIT_REACHED";
      readonly statesExplored: number;
      readonly transitionsEvaluated: number;
    }
  | {
      readonly status: "CANCELLED";
      readonly statesExplored: number;
    };

/** Applies TLA+ UNCHANGED semantics: merges current state with action's modified variables. */
function applyAction(current: State, action: CompiledAction): State {
  return applyStateDelta(current, action.effect(current));
}

/**
 * Explicit-state BFS Model Checker.
 * Guarantees shortest-path counterexamples for safety invariants and deadlocks,
 * and constructs the full reachable StateGraph when liveness properties are present.
 */
export function verifyCompiledModel(
  spec: CompiledSpec,
  options: CheckerOptions = {},
  livenessProperties: readonly VisualLivenessIR[] = []
): VerificationResult {
  const startTime = Date.now();
  const maxStates = options.maxStates ?? 50_000;
  const checkDeadlocks = options.checkDeadlocks ?? true;
  const shouldCheckLiveness =
    (options.checkLiveness ?? true) && livenessProperties.length > 0;
  const progressInterval = options.progressInterval ?? 500;

  const visited = new Set<string>();
  const parentMap = new Map<string, ParentEntry>();
  const statesMap = shouldCheckLiveness ? new Map<string, State>() : null;
  const edgesMap = shouldCheckLiveness ? new Map<string, GraphEdge[]>() : null;
  const queue: string[] = [];

  let transitionsEvaluated = 0;

  // 1. Initialize (Init)
  for (const initState of spec.initialStates) {
    const frozenInit = Object.freeze({ ...initState });
    const hash = canonicalHash(frozenInit);

    if (!visited.has(hash)) {
      visited.add(hash);
      parentMap.set(hash, {
        parentHash: null,
        actionName: "Init",
        state: frozenInit,
      });
      if (statesMap && edgesMap) {
        statesMap.set(hash, frozenInit);
        edgesMap.set(hash, []);
      }
      queue.push(hash);

      const broken = spec.invariants.find((inv) => !inv.predicate(frozenInit));
      if (broken) {
        return {
          status: "INVARIANT_VIOLATED",
          violatedInvariant: { id: broken.id, description: broken.description },
          counterexample: buildTracePrefix(hash, parentMap),
          statesExplored: visited.size,
          transitionsEvaluated,
        };
      }
    }
  }

  // 2. BFS State Space Exploration (Next)
  let head = 0;
  while (head < queue.length) {
    if (options.isAborted?.()) {
      return { status: "CANCELLED", statesExplored: visited.size };
    }

    if (visited.size >= maxStates) {
      return {
        status: "LIMIT_REACHED",
        statesExplored: visited.size,
        transitionsEvaluated,
      };
    }

    const currentHash = queue[head++];
    const currentState = parentMap.get(currentHash)!.state;

    if (options.onProgress && head % progressInterval === 0) {
      options.onProgress({
        statesExplored: visited.size,
        transitionsEvaluated,
        queueSize: queue.length - head,
      });
    }

    let enabledActionsCount = 0;
    const currentEdges = edgesMap ? edgesMap.get(currentHash)! : null;

    for (const action of spec.actions) {
      if (!action.guard(currentState)) {
        continue;
      }

      enabledActionsCount++;
      transitionsEvaluated++;

      const nextState = applyAction(currentState, action);
      const nextHash = canonicalHash(nextState);

      if (currentEdges) {
        currentEdges.push({ toHash: nextHash, actionName: action.name });
      }

      if (!visited.has(nextHash)) {
        if (visited.size >= maxStates) {
          return {
            status: "LIMIT_REACHED",
            statesExplored: visited.size,
            transitionsEvaluated,
          };
        }

        visited.add(nextHash);
        parentMap.set(nextHash, {
          parentHash: currentHash,
          actionName: action.name,
          state: nextState,
        });
        if (statesMap && edgesMap) {
          statesMap.set(nextHash, nextState);
          edgesMap.set(nextHash, []);
        }

        const broken = spec.invariants.find((inv) => !inv.predicate(nextState));
        if (broken) {
          return {
            status: "INVARIANT_VIOLATED",
            violatedInvariant: { id: broken.id, description: broken.description },
            counterexample: buildTracePrefix(nextHash, parentMap),
            statesExplored: visited.size,
            transitionsEvaluated,
          };
        }

        queue.push(nextHash);
      }
    }

    // 3. Deadlock detection
    const isTerminal = spec.isTerminalState?.(currentState) ?? false;
    if (checkDeadlocks && enabledActionsCount === 0 && !isTerminal) {
      return {
        status: "DEADLOCK",
        counterexample: buildTracePrefix(currentHash, parentMap),
        statesExplored: visited.size,
        transitionsEvaluated,
      };
    }
  }

  // 4. Temporal Liveness verification (◇P and P ~> Q)
  if (shouldCheckLiveness && statesMap && edgesMap) {
    const graph = {
      states: statesMap,
      edges: edgesMap,
      parentMap,
    };

    for (const prop of livenessProperties) {
      const violation = checkLivenessProperty(prop, graph);
      if (violation) {
        return {
          status: "LIVENESS_VIOLATED",
          violation,
          statesExplored: visited.size,
          transitionsEvaluated,
        };
      }
    }
  }

  return {
    status: "PASSED",
    statesExplored: visited.size,
    transitionsEvaluated,
    durationMs: Date.now() - startTime,
  };
}

/**
 * High-level entrypoint: validates, compiles, and verifies a VisualSpecIR.
 */
export function verifySpec(
  spec: VisualSpecIR,
  options: CheckerOptions = {}
): VerificationResult {
  const issues = validateSpec(spec);
  if (hasValidationErrors(issues)) {
    return {
      status: "VALIDATION_ERROR",
      issues,
    };
  }

  const compiled = compileSpec(spec);
  return verifyCompiledModel(compiled, options, spec.livenessProperties);
}
