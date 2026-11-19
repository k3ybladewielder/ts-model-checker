import { describe, expect, it } from "vitest";
import {
  concurrentTransferBuggySpec,
  concurrentTransferFixedSpec,
} from "@ts-model-checker/core";
import { runModelCheckAsync } from "../src";

describe("@ts-model-checker/worker client", () => {
  it("runs verification via async fallback when Worker is unavailable", async () => {
    const resBuggy = await runModelCheckAsync(concurrentTransferBuggySpec);
    expect(resBuggy.status).toBe("INVARIANT_VIOLATED");

    const resFixed = await runModelCheckAsync(concurrentTransferFixedSpec);
    expect(resFixed.status).toBe("PASSED");
  });

  it("returns CANCELLED immediately when AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await runModelCheckAsync(concurrentTransferFixedSpec, {
      signal: controller.signal,
    });
    expect(res.status).toBe("CANCELLED");
  });
});
