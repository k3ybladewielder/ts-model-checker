import { describe, expect, it } from "vitest";
import { verifySpec, type VisualSpecIR } from "../src";

describe("livenessChecker (Tarjan SCC)", () => {
  it("detects EVENTUALLY (◇P) violation with a Lasso cycle", () => {
    // System can toggle between A and B forever without ever reaching DONE
    const livelockSpec: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "LivelockDemo",
      variables: [{ name: "state", type: "string" }],
      initialStates: [{ state: "A" }],
      actions: [
        {
          id: "a_to_b",
          name: "A_to_B",
          guard: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "state" },
            right: { kind: "Literal", value: "A" },
          },
          effects: [{ targetVar: "state", expression: { kind: "Literal", value: "B" } }],
        },
        {
          id: "b_to_a",
          name: "B_to_A",
          guard: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "state" },
            right: { kind: "Literal", value: "B" },
          },
          effects: [{ targetVar: "state", expression: { kind: "Literal", value: "A" } }],
        },
      ],
      invariants: [],
      livenessProperties: [
        {
          id: "reach_done",
          kind: "EVENTUALLY",
          description: "Eventually reaches DONE",
          eventually: {
            kind: "BinaryOp",
            op: "==",
            left: { kind: "Var", name: "state" },
            right: { kind: "Literal", value: "DONE" },
          },
        },
      ],
    };

    const result = verifySpec(livelockSpec);
    expect(result.status).toBe("LIVENESS_VIOLATED");
    if (result.status === "LIVENESS_VIOLATED") {
      expect(result.violation.violatedProperty.id).toBe("reach_done");
      expect(result.violation.prefix.length).toBeGreaterThanOrEqual(1);
      expect(result.violation.cycle.length).toBe(2);
    }
  });

  it("detects LEADS_TO (P ~> Q) violation when P can loop forever without Q", () => {
    const starvationSpec: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "StarvationDemo",
      variables: [
        { name: "req", type: "boolean" },
        { name: "ack", type: "boolean" },
      ],
      initialStates: [{ req: false, ack: false }],
      actions: [
        {
          id: "send_req",
          name: "SendReq",
          guard: {
            kind: "UnaryOp",
            op: "!",
            operand: { kind: "Var", name: "req" },
          },
          effects: [{ targetVar: "req", expression: { kind: "Literal", value: true } }],
        },
        {
          id: "ignore_req",
          name: "IgnoreReq",
          guard: {
            kind: "BinaryOp",
            op: "&&",
            left: { kind: "Var", name: "req" },
            right: {
              kind: "UnaryOp",
              op: "!",
              operand: { kind: "Var", name: "ack" },
            },
          },
          effects: [], // self-loop without ack
        },
      ],
      invariants: [],
      livenessProperties: [
        {
          id: "req_leads_to_ack",
          kind: "LEADS_TO",
          description: "Every request eventually gets acknowledged",
          trigger: { kind: "Var", name: "req" },
          response: { kind: "Var", name: "ack" },
        },
      ],
    };

    const result = verifySpec(starvationSpec);
    expect(result.status).toBe("LIVENESS_VIOLATED");
    if (result.status === "LIVENESS_VIOLATED") {
      expect(result.violation.violatedProperty.id).toBe("req_leads_to_ack");
      expect(result.violation.cycle[0].state).toEqual({ req: true, ack: false });
    }
  });

  it("passes LEADS_TO (P ~> Q) when every P inevitably reaches Q", () => {
    const guaranteedSpec: VisualSpecIR = {
      schemaVersion: 1,
      moduleName: "GuaranteedAck",
      variables: [
        { name: "req", type: "boolean" },
        { name: "ack", type: "boolean" },
      ],
      initialStates: [{ req: false, ack: false }],
      actions: [
        {
          id: "send_req",
          name: "SendReq",
          guard: {
            kind: "UnaryOp",
            op: "!",
            operand: { kind: "Var", name: "req" },
          },
          effects: [{ targetVar: "req", expression: { kind: "Literal", value: true } }],
        },
        {
          id: "send_ack",
          name: "SendAck",
          guard: {
            kind: "BinaryOp",
            op: "&&",
            left: { kind: "Var", name: "req" },
            right: {
              kind: "UnaryOp",
              op: "!",
              operand: { kind: "Var", name: "ack" },
            },
          },
          effects: [{ targetVar: "ack", expression: { kind: "Literal", value: true } }],
        },
      ],
      invariants: [],
      livenessProperties: [
        {
          id: "req_leads_to_ack",
          kind: "LEADS_TO",
          description: "Every request eventually gets acknowledged",
          trigger: { kind: "Var", name: "req" },
          response: { kind: "Var", name: "ack" },
        },
      ],
      terminalCondition: { kind: "Var", name: "ack" },
    };

    const result = verifySpec(guaranteedSpec);
    expect(result.status).toBe("PASSED");
  });
});
