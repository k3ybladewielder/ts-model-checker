import {
  verifySpec,
  type CheckerProgress,
  type VerificationResult,
  type VisualSpecIR,
} from "@ts-model-checker/core";
import type {
  WorkerCheckOptions,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

export interface RunWorkerCheckOptions extends WorkerCheckOptions {
  /** Optional custom Worker factory (e.g., `() => new Worker(new URL(...), { type: 'module' })`). */
  readonly createWorker?: () => Worker;
  readonly onProgress?: (progress: CheckerProgress) => void;
  readonly signal?: AbortSignal;
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `req_${Date.now()}_${requestCounter}`;
}

/**
 * Runs model verification asynchronously inside a Web Worker when available,
 * with a clean async fallback when running in Node.js or environments without Worker.
 */
export function runModelCheckAsync(
  spec: VisualSpecIR,
  options: RunWorkerCheckOptions = {}
): Promise<VerificationResult> {
  if (options.signal?.aborted) {
    return Promise.resolve({ status: "CANCELLED", statesExplored: 0 });
  }

  const canUseWorker =
    typeof Worker !== "undefined" && typeof options.createWorker === "function";

  if (!canUseWorker) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = verifySpec(spec, {
          maxStates: options.maxStates,
          checkDeadlocks: options.checkDeadlocks,
          checkLiveness: options.checkLiveness,
          progressInterval: options.progressInterval,
          onProgress: options.onProgress,
          isAborted: () => options.signal?.aborted ?? false,
        });
        resolve(result);
      }, 0);
    });
  }

  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    const worker = options.createWorker!();

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
    };

    const onAbort = () => {
      const cancelMsg: WorkerRequest = { type: "CANCEL", requestId };
      worker.postMessage(cancelMsg);
      cleanup();
      resolve({ status: "CANCELLED", statesExplored: 0 });
    };

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.requestId !== requestId) return;

      if (msg.type === "PROGRESS") {
        options.onProgress?.(msg.progress);
      } else if (msg.type === "RESULT") {
        cleanup();
        resolve(msg.result);
      } else if (msg.type === "ERROR") {
        cleanup();
        reject(new Error(msg.message));
      }
    };

    const onError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || "Web Worker execution failed"));
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    const request: WorkerRequest = {
      type: "CHECK_SPEC",
      requestId,
      spec,
      options: {
        maxStates: options.maxStates,
        checkDeadlocks: options.checkDeadlocks,
        checkLiveness: options.checkLiveness,
        progressInterval: options.progressInterval,
      },
    };
    worker.postMessage(request);
  });
}
