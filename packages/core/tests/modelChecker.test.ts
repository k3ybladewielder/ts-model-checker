import { describe, expect, it } from "vitest";
import {
  concurrentTransferBuggySpec,
  concurrentTransferFixedSpec,
  mutexSpec,
  twoPhaseCommitSpec,
  verifySpec,
  type VisualSpecIR,
} from "../src";

describe("verifySpec (BFS Model Checker)", () => {
  it("detects the race condition in concurrentTransferBuggySpec with shortest counterexample", () => {
    const result = verifySpec(concurrentTransferBuggySpec);
    expect(result.status).toBe("INVARIANT_VIOLATED");
    if (result.status === "INVARIANT_VIOLATED") {
      expect(result.violatedInvariant.id).toBe("balance_non_negative");
      const lastStep = result.counterexample[result.counterexample.length - 1];
      expect(lastStep.state.balance).toBe(-60);
      expect(result.counterexample).toHaveLength(5); // Init + 4 actions
    }
  });

  it("verifies concurrentTransferFixedSpec as PASSED", () => {
    const result = verifySpec(concurrentTransferFixedSpec);
    expect(result.status).toBe("PASSED");
    if (result.status === "PASSED") {
      expect(result.statesExplored).toBeGreaterThan(1);
    }
  });

  it("verifies mutexSpec and twoPhaseCommitSpec as PASSED", () => {
    expect(verifySpec(mutexSpec).status).toBe("PASSED");
    expect(verifySpec(twoPhaseCommitSpec).status).toBe("PASSED");
  });

  it("detects deadlock when no actions are enabled in a non-terminal state", () => {
    const deadlockSpec: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "DeadlockDemo",
      variables: [{ name: "step", type: "number" }],
      initialStates: [{ step: 0 }],
      actions: [
        {
          id: "advance",
          name: "Advance",
          guard: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "step" },
            right: { kind: "Literal", value: 0 },
          },
          effects: [{ targetVar: "step", expression: { kind: "Literal", value: 1 } }],
        },
      ],
      invariants: [],
      livenessProperties: [],
    };

    const result = verifySpec(deadlockSpec);
    expect(result.status).toBe("DEADLOCK");
    if (result.status === "DEADLOCK") {
      expect(result.counterexample).toHaveLength(2);
      expect(result.counterexample[1].state.step).toBe(1);
    }
  });

  it("respects maxStates limit and returns LIMIT_REACHED", () => {
    const unboundedCounter: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "Unbounded",
      variables: [{ name: "n", type: "number" }],
      initialStates: [{ n: 0 }],
      actions: [
        {
          id: "inc",
          name: "Inc",
          guard: { kind: "Literal", value: true },
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

    const result = verifySpec(unboundedCounter, { maxStates: 10 });
    expect(result.status).toBe("LIMIT_REACHED");
    if (result.status === "LIMIT_REACHED") {
      expect(result.statesExplored).toBe(10);
    }
  });
});
