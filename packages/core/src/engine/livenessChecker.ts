import type { State, TraceStep, VisualLivenessIR } from "../ast/types";
import { evaluateExpr } from "./evaluator";

export interface GraphEdge {
  readonly toHash: string;
  readonly actionName: string;
}

export interface ParentEntry {
  readonly parentHash: string | null;
  readonly actionName: string;
  readonly state: State;
}

export interface StateGraph {
  readonly states: ReadonlyMap<string, State>;
  readonly edges: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly parentMap: ReadonlyMap<string, ParentEntry>;
}

export interface LivenessViolation {
  readonly violatedProperty: VisualLivenessIR;
  /** Shortest path from Init to the start of the violating cycle. */
  readonly prefix: readonly TraceStep[];
  /** Infinite cycle (or terminal stutter state) where the property is never satisfied. */
  readonly cycle: readonly TraceStep[];
}

/**
 * Reconstructs the shortest path from Init to `targetHash` using BFS parent pointers.
 */
export function buildTracePrefix(
  targetHash: string,
  parentMap: ReadonlyMap<string, ParentEntry>
): readonly TraceStep[] {
  const steps: TraceStep[] = [];
  let cursor: string | null = targetHash;

  while (cursor !== null) {
    const node = parentMap.get(cursor);
    if (!node) break;
    steps.push({
      stepIndex: 0,
      actionName: node.actionName,
      state: node.state,
    });
    cursor = node.parentHash;
  }

  return steps
    .reverse()
    .map((step, index) => Object.freeze({ ...step, stepIndex: index }));
}

/**
 * Tarjan's Strongly Connected Components (SCC) algorithm.
 * Operates on the subgraph restricted to `allowedHashes` and returns all
 * violating SCCs (size > 1, self-loop, or global terminal state).
 */
function findAllViolatingSccs(
  allowedHashes: ReadonlySet<string>,
  edges: ReadonlyMap<string, readonly GraphEdge[]>
): readonly (readonly string[])[] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const violatingSccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const outgoing = edges.get(v) ?? [];
    for (const edge of outgoing) {
      const w = edge.toHash;
      if (!allowedHashes.has(w)) continue;

      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      if (scc.length > 1) {
        violatingSccs.push(scc.reverse());
      } else {
        const single = scc[0];
        const allOutgoing = edges.get(single) ?? [];
        const hasSelfLoop = allOutgoing.some((e) => e.toHash === single);
        if (hasSelfLoop || allOutgoing.length === 0) {
          violatingSccs.push([single]);
        }
      }
    }
  }

  for (const hash of allowedHashes) {
    if (!indices.has(hash)) {
      strongConnect(hash);
    }
  }

  return violatingSccs;
}

/**
 * Finds the shortest path within `allowedHashes` from `startHash` to any node in `targetSet`.
 */
function findShortestPathInSubgraph(
  startHash: string,
  targetSet: ReadonlySet<string>,
  allowedHashes: ReadonlySet<string>,
  edges: ReadonlyMap<string, readonly GraphEdge[]>
): readonly { readonly hash: string; readonly actionName: string }[] | null {
  if (targetSet.has(startHash)) {
    return [];
  }

  const visited = new Set<string>([startHash]);
  const parent = new Map<string, { readonly prev: string; readonly actionName: string }>();
  const queue: string[] = [startHash];
  let head = 0;

  while (head < queue.length) {
    const curr = queue[head++];
    for (const edge of edges.get(curr) ?? []) {
      if (!allowedHashes.has(edge.toHash) || visited.has(edge.toHash)) continue;
      visited.add(edge.toHash);
      parent.set(edge.toHash, { prev: curr, actionName: edge.actionName });

      if (targetSet.has(edge.toHash)) {
        const path: { hash: string; actionName: string }[] = [];
        let c: string = edge.toHash;
        while (c !== startHash) {
          const p = parent.get(c)!;
          path.push({ hash: c, actionName: p.actionName });
          c = p.prev;
        }
        return path.reverse();
      }
      queue.push(edge.toHash);
    }
  }

  return null;
}

/**
 * Builds a cyclic TraceStep list from an SCC's ordered node hashes.
 * Walks a closed cycle inside the SCC when possible.
 */
function buildCycleSteps(
  sccHashes: readonly string[],
  graph: StateGraph,
  startStepIndex: number
): readonly TraceStep[] {
  const sccSet = new Set(sccHashes);
  if (sccHashes.length === 1) {
    const h = sccHashes[0];
    const selfEdge = (graph.edges.get(h) ?? []).find((e) => e.toHash === h);
    return [
      Object.freeze({
        stepIndex: startStepIndex,
        actionName: selfEdge?.actionName ?? "Stutter (Terminal)",
        state: graph.states.get(h)!,
      }),
    ];
  }

  // Order cycle steps by following edges inside the SCC
  const ordered: { hash: string; actionName: string }[] = [];
  const start = sccHashes[0];
  let current = start;
  const visitedInCycle = new Set<string>();

  for (let i = 0; i < sccHashes.length; i++) {
    visitedInCycle.add(current);
    const outgoing = (graph.edges.get(current) ?? []).filter((e) =>
      sccSet.has(e.toHash)
    );
    const nextEdge =
      outgoing.find((e) => !visitedInCycle.has(e.toHash)) ?? outgoing[0];
    if (!nextEdge) break;
    ordered.push({ hash: nextEdge.toHash, actionName: nextEdge.actionName });
    current = nextEdge.toHash;
    if (current === start) break;
  }

  return ordered.map((item, idx) =>
    Object.freeze({
      stepIndex: startStepIndex + idx,
      actionName: item.actionName,
      state: graph.states.get(item.hash)!,
    })
  );
}

/**
 * Checks a single temporal liveness property (◇P or P ~> Q) over the full StateGraph.
 */
export function checkLivenessProperty(
  prop: VisualLivenessIR,
  graph: StateGraph
): LivenessViolation | null {
  if (prop.kind === "EVENTUALLY") {
    const badHashes = new Set<string>();
    for (const [hash, state] of graph.states.entries()) {
      if (!Boolean(evaluateExpr(prop.eventually, state))) {
        badHashes.add(hash);
      }
    }
    if (badHashes.size === 0) return null;

    const sccs = findAllViolatingSccs(badHashes, graph.edges);
    if (sccs.length === 0) return null;

    const cycleHashes = sccs[0];
    const prefix = buildTracePrefix(cycleHashes[0], graph.parentMap);
    const cycle = buildCycleSteps(cycleHashes, graph, prefix.length);
    return { violatedProperty: prop, prefix, cycle };
  }

  // LEADS_TO: P ~> Q (whenever P holds, Q must eventually hold)
  const notQHashes = new Set<string>();
  const triggerHashes: string[] = [];

  for (const [hash, state] of graph.states.entries()) {
    const qHolds = Boolean(evaluateExpr(prop.response, state));
    if (!qHolds) {
      notQHashes.add(hash);
      if (Boolean(evaluateExpr(prop.trigger, state))) {
        triggerHashes.push(hash);
      }
    }
  }

  if (triggerHashes.length === 0) return null;

  const violatingSccs = findAllViolatingSccs(notQHashes, graph.edges);
  if (violatingSccs.length === 0) return null;

  const badSccNodes = new Set<string>();
  const nodeToScc = new Map<string, readonly string[]>();
  for (const scc of violatingSccs) {
    for (const h of scc) {
      badSccNodes.add(h);
      nodeToScc.set(h, scc);
    }
  }

  for (const triggerHash of triggerHashes) {
    const bridge = findShortestPathInSubgraph(
      triggerHash,
      badSccNodes,
      notQHashes,
      graph.edges
    );
    if (bridge !== null) {
      const initToTrigger = buildTracePrefix(triggerHash, graph.parentMap);
      const bridgeSteps: TraceStep[] = bridge.map((step, idx) =>
        Object.freeze({
          stepIndex: initToTrigger.length + idx,
          actionName: step.actionName,
          state: graph.states.get(step.hash)!,
        })
      );
      const prefix = [...initToTrigger, ...bridgeSteps];
      const entryHash =
        bridge.length > 0 ? bridge[bridge.length - 1].hash : triggerHash;
      const scc = nodeToScc.get(entryHash)!;
      const rotatedScc = [
        entryHash,
        ...scc.filter((h) => h !== entryHash),
      ];
      const cycle = buildCycleSteps(rotatedScc, graph, prefix.length);
      return { violatedProperty: prop, prefix, cycle };
    }
  }

  return null;
}
