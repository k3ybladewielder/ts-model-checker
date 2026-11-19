import { describe, expect, it } from "vitest";
import {
  exprToTla,
  mutexSpec,
  transpileToTla,
  twoPhaseCommitSpec,
} from "../src";

describe("tlaGenerator", () => {
  it("transpiles all ExprNode variants accurately", () => {
    expect(
      exprToTla({
        kind: "Quantifier",
        quantifier: "FORALL",
        boundVar: "x",
        domain: {
          kind: "Range",
          start: { kind: "Literal", value: 1 },
          end: { kind: "Literal", value: 3 },
        },
        predicate: {
          kind: "BinaryOp",
          op: "IN",
          left: { kind: "Var", name: "x" },
          right: {
            kind: "SetLiteral",
            elements: [
              { kind: "Literal", value: 1 },
              { kind: "Literal", value: 2 },
            ],
          },
        },
      })
    ).toBe("(\\A x \\in (1..3) : (x \\in {1, 2}))");

    expect(
      exprToTla({
        kind: "IfThenElse",
        condition: { kind: "Literal", value: true },
        thenBranch: { kind: "Literal", value: 10 },
        elseBranch: { kind: "Literal", value: 20 },
      })
    ).toBe("(IF TRUE THEN 10 ELSE 20)");
  });

  it("generates valid TLA+ module and .cfg for mutexSpec with automatic UNCHANGED", () => {
    const { tlaFileContent, cfgFileContent } = transpileToTla(mutexSpec);

    expect(tlaFileContent).toContain("---------------------------- MODULE MutexTwoProcesses ----------------------------");
    expect(tlaFileContent).toContain("VARIABLES lock, p1, p2");
    expect(tlaFileContent).toContain("UNCHANGED <<lock, p2>>");
    expect(tlaFileContent).toContain("UNCHANGED p2");
    expect(tlaFileContent).toContain("Inv_mutual_exclusion ==");
    expect(cfgFileContent).toContain("SPECIFICATION Spec");
    expect(cfgFileContent).toContain("INVARIANT Inv_mutual_exclusion");
  });

  it("generates liveness PROPERTY and Terminated action for twoPhaseCommitSpec", () => {
    const { tlaFileContent, cfgFileContent } = transpileToTla(twoPhaseCommitSpec);

    expect(tlaFileContent).toContain("Live_decision_reached == <>((tmState # \"INIT\"))");
    expect(tlaFileContent).toContain("Terminated ==");
    expect(cfgFileContent).toContain("PROPERTY Live_decision_reached");
  });
});
