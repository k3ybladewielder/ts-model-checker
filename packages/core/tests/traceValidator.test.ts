import { describe, expect, it } from "vitest";
import {
  concurrentTransferFixedSpec,
  validateExecutionTrace,
} from "../src";

describe("validateExecutionTrace", () => {
  it("validates a conforming execution log", () => {
    const result = validateExecutionTrace(concurrentTransferFixedSpec, [
      { balance: 100, p1: "IDLE", p2: "IDLE" },
      { balance: 20, p1: "COMPLETED", p2: "IDLE" },
      { balance: 20, p1: "COMPLETED", p2: "REJECTED" },
    ]);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.matchedActions).toEqual([
        "Init",
        "P1_AtomicDebit",
        "P2_RejectInsufficientFunds",
      ]);
    }
  });

  it("rejects an invalid transition not allowed by any action", () => {
    const result = validateExecutionTrace(concurrentTransferFixedSpec, [
      { balance: 100, p1: "IDLE", p2: "IDLE" },
      { balance: 50, p1: "COMPLETED", p2: "IDLE" }, // invalid debit amount
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.failedAtStep).toBe(1);
    }
  });

  it("rejects an invalid initial state", () => {
    const result = validateExecutionTrace(concurrentTransferFixedSpec, [
      { balance: 999, p1: "IDLE", p2: "IDLE" },
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.failedAtStep).toBe(0);
    }
  });
});
