import { verifySpec } from "@ts-model-checker/core";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const activeRequests = new Map<string, { cancelled: boolean }>();

function postWorkerMessage(msg: WorkerResponse): void {
  self.postMessage(msg);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const payload = event.data;

  if (payload.type === "CANCEL") {
    const state = activeRequests.get(payload.requestId);
    if (state) {
      state.cancelled = true;
    }
    return;
  }

  if (payload.type === "CHECK_SPEC") {
    const token = { cancelled: false };
    activeRequests.set(payload.requestId, token);

    try {
      const result = verifySpec(payload.spec, {
        ...payload.options,
        isAborted: () => token.cancelled,
        onProgress: (progress) => {
          postWorkerMessage({
            type: "PROGRESS",
            requestId: payload.requestId,
            progress,
          });
        },
      });

      postWorkerMessage({
        type: "RESULT",
        requestId: payload.requestId,
        result,
      });
    } catch (err) {
      postWorkerMessage({
        type: "ERROR",
        requestId: payload.requestId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      activeRequests.delete(payload.requestId);
    }
  }
});
