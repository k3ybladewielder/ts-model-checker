import type { VisualSpecIR } from "../ast/types";
import {
  concurrentTransferBuggySpec,
  concurrentTransferFixedSpec,
} from "./concurrentTransfer";
import { mutexSpec } from "./mutex";
import { twoPhaseCommitSpec } from "./twoPhaseCommit";

export {
  concurrentTransferBuggySpec,
  concurrentTransferFixedSpec,
  mutexSpec,
  twoPhaseCommitSpec,
};

/** Creates a minimal blank specification so users can design a system from scratch. */
export function createBlankSpec(moduleName = "MySystem"): VisualSpecIR {
  return {
    schemaVersion: 1,
    moduleName,
    variables: [{ name: "status", type: "string", description: "System state" }],
    initialStates: [{ status: "INIT" }],
    actions: [],
    invariants: [],
    livenessProperties: [],
  };
}

export interface PresetEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly spec: VisualSpecIR;
}

export const PRESET_CATALOG: readonly PresetEntry[] = [
  {
    id: "concurrent-transfer-buggy",
    title: "Concurrent Transfer (With Race Condition)",
    summary:
      "Two processes check balance >= 80 before debiting. The model checker finds the exact counterexample where balance reaches -60.",
    spec: concurrentTransferBuggySpec,
  },
  {
    id: "concurrent-transfer-fixed",
    title: "Concurrent Transfer (Fixed)",
    summary:
      "Atomic check-and-debit version: guarantees balance never becomes negative and avoids deadlocks.",
    spec: concurrentTransferFixedSpec,
  },
  {
    id: "mutex",
    title: "Mutual Exclusion (Mutex)",
    summary:
      "Two processes competing for a shared lock, ensuring they never enter the critical section simultaneously.",
    spec: mutexSpec,
  },
  {
    id: "two-phase-commit",
    title: "Two-Phase Commit (2PC)",
    summary:
      "Distributed consensus protocol verifying consistency (Safety) and eventual decision (Liveness ◇P).",
    spec: twoPhaseCommitSpec,
  },
];
