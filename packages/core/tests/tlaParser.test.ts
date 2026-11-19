import { describe, expect, it } from "vitest";
import {
  concurrentTransferBuggySpec,
  concurrentTransferFixedSpec,
  mutexSpec,
  parseJsonToSpec,
  parseTlaToSpec,
  transpileToTla,
  twoPhaseCommitSpec,
  verifySpec,
} from "../src";

describe("tlaParser (TLA+ & JSON import)", () => {
  it("round-trips concurrentTransferBuggySpec through TLA+ export and import", () => {
    const { tlaFileContent, cfgFileContent } = transpileToTla(concurrentTransferBuggySpec);
    const { spec, warnings } = parseTlaToSpec(tlaFileContent, {
      cfgContent: cfgFileContent,
    });

    expect(warnings).toHaveLength(0);
    expect(spec.moduleName).toBe("ConcurrentTransferBuggy");
    expect(spec.actions).toHaveLength(concurrentTransferBuggySpec.actions.length);
    expect(spec.invariants).toHaveLength(1);

    const res = verifySpec(spec);
    expect(res.status).toBe("INVARIANT_VIOLATED");
    if (res.status === "INVARIANT_VIOLATED") {
      expect(res.counterexample[res.counterexample.length - 1].state.balance).toBe(-60);
    }
  });

  it("round-trips concurrentTransferFixedSpec, mutexSpec, and twoPhaseCommitSpec", () => {
    for (const original of [
      concurrentTransferFixedSpec,
      mutexSpec,
      twoPhaseCommitSpec,
    ]) {
      const { tlaFileContent, cfgFileContent } = transpileToTla(original);
      const { spec, warnings } = parseTlaToSpec(tlaFileContent, {
        cfgContent: cfgFileContent,
      });

      expect(warnings).toHaveLength(0);
      expect(verifySpec(spec).status).toBe("PASSED");
    }
  });

  it("parses hand-written TLA+ with comments, UNCHANGED, and <> liveness", () => {
    const handWritten = `
---------------------------- MODULE SimpleToggle ----------------------------
EXTENDS Integers
VARIABLES flag, count

(* Initial state *)
Init ==
    /\\ flag = FALSE
    /\\ count = 0

TurnOn ==
    /\\ flag = FALSE
    /\\ flag' = TRUE
    /\\ count' = count + 1

Done ==
    /\\ flag = TRUE
    /\\ UNCHANGED <<flag, count>>

Next ==
    \\/ TurnOn
    \\/ Done

Inv_bounded == count <= 1
Live_done == <>(flag = TRUE)
=============================================================================
`;
    const { spec, warnings } = parseTlaToSpec(handWritten);
    expect(warnings).toHaveLength(0);
    expect(spec.moduleName).toBe("SimpleToggle");
    expect(spec.variables).toHaveLength(2);
    expect(spec.invariants).toHaveLength(1);
    expect(spec.livenessProperties).toHaveLength(1);
    expect(verifySpec(spec).status).toBe("PASSED");
  });

  it("round-trips VisualSpecIR through JSON export and parseJsonToSpec", () => {
    const json = JSON.stringify(mutexSpec, null, 2);
    const { spec, issues } = parseJsonToSpec(json);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(verifySpec(spec).status).toBe("PASSED");
  });

  it("rejects invalid JSON or forbidden identifiers", () => {
    expect(() => parseJsonToSpec("{}")).toThrow(/schemaVersion/);
    expect(() =>
      parseTlaToSpec(`
---- MODULE Bad ----
VARIABLES __proto__
Init == __proto__ = 1
====
`)
    ).toThrow(/Could not parse any initial state|Forbidden/);
  });
});
